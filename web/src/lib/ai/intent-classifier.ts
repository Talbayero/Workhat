import { createAdminClient } from "@/lib/supabase/admin";
import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";

/* ─────────────────────────────────────────────────────────────────────────────
   intent-classifier.ts

   DB-driven keyword classification engine.

   Usage:
     const intent = await classifyIntent(orgId, subject, body);
     // → "billing" | "support" | "unclassified" | ...

   Algorithm:
     1. Load intents for the org, ordered by priority_order ASC.
     2. For each intent, check if ANY keyword appears in (subject + body),
        case-insensitive, whole-word-ish match.
     3. Return the name of the first matching intent (lowercased slug).
     4. No match → return "unclassified".

   Intent names are stored as-is in the DB (e.g. "Billing Support") and
   returned as a lowercased slug (e.g. "billing support") for consistency
   with the existing conversations.intent string column.
───────────────────────────────────────────────────────────────────────────── */

export type ClassifiedIntent = string; // "billing" | "support" | "unclassified" | ...

type DbIntent = {
  name: string;
  keywords: string[];
  skill_required: string | null;
  priority_order: number;
};

type UserSkill = {
  name: string;
  priority: number;
};

function normalizeUserSkills(value: unknown): UserSkill[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((skill) => {
    if (!skill || typeof skill !== "object") return [];

    const maybeSkill = skill as { name?: unknown; priority?: unknown };
    if (typeof maybeSkill.name !== "string") return [];

    const name = maybeSkill.name.trim();
    if (!name) return [];

    return [{
      name,
      priority: typeof maybeSkill.priority === "number" && Number.isFinite(maybeSkill.priority)
        ? maybeSkill.priority
        : 5,
    }];
  });
}

// In-process cache per org so we don't hit the DB on every inbound webhook.
// TTL: 60 seconds. Fine-grained enough for real-time config changes.
const cache = new Map<string, { intents: DbIntent[]; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function loadIntents(orgId: string): Promise<DbIntent[]> {
  const cached = cache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.intents;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("intents")
    .select("name, keywords, skill_required, priority_order")
    .eq("org_id", orgId)
    .order("priority_order", { ascending: true });

  if (error || !data) {
    console.error("[intent-classifier] Failed to load intents:", error?.message);
    return [];
  }

  cache.set(orgId, { intents: data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

/** Invalidate the cache for an org (call after any intent CRUD). */
export function invalidateIntentCache(orgId: string) {
  cache.delete(orgId);
}

/**
 * Classify the intent of an inbound message using the org's keyword rules.
 * Returns the intent name (lowercased) or "unclassified".
 */
export async function classifyIntent(
  orgId: string,
  subject: string,
  body: string
): Promise<ClassifiedIntent> {
  const intents = await loadIntents(orgId);
  if (intents.length === 0) return "unclassified";

  const haystack = `${subject} ${body}`.toLowerCase();

  for (const intent of intents) {
    if (!intent.keywords || intent.keywords.length === 0) continue;

    const matched = intent.keywords.some((kw) => {
      const normalized = kw.trim().toLowerCase();
      if (!normalized) return false;
      // Use word-boundary matching for single words, substring for phrases
      if (/\s/.test(normalized)) {
        return haystack.includes(normalized);
      }
      // Whole-word-ish: not preceded/followed by alphanumeric
      try {
        return new RegExp(`(?<![a-z0-9])${escapeRegex(normalized)}(?![a-z0-9])`, "i").test(haystack);
      } catch {
        return haystack.includes(normalized);
      }
    });

    if (matched) return intent.name.toLowerCase();
  }

  return "unclassified";
}

/**
 * Find the best agent to route to based on required skill.
 * Returns a user_id or null if no match found.
 * Prefers agents with lower skill priority number (1 = primary).
 * Among equal-priority agents, uses round-robin (by created_at order).
 */
export async function routeBySkill(
  orgId: string,
  skillRequired: string | null
): Promise<string | null> {
  if (!skillRequired) return null;

  const admin = createAdminClient();

  // Query all active agents in the org that have the required skill
  const { data: users, error } = await admin
    .from("users")
    .select("id, skills, created_at")
    .eq("org_id", orgId)
    .eq("status", "active")
    .in("role", ["agent", "manager"]);

  if (error) {
    console.error("[intent-classifier] Failed to load routing candidates:", error.message);
    return null;
  }

  if (!users || users.length === 0) return null;

  const skillLower = skillRequired.toLowerCase().trim();

  type Candidate = { id: string; skillPriority: number; createdAt: string };
  const candidates: Candidate[] = [];

  for (const u of users) {
    const skills = normalizeUserSkills(u.skills);
    const match = skills.find((s) => s.name.toLowerCase().trim() === skillLower);
    if (match) {
      candidates.push({
        id: u.id,
        skillPriority: match.priority,
        createdAt: u.created_at as string,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by skill priority (ascending = more primary first), then created_at for round-robin
  candidates.sort((a, b) =>
    a.skillPriority !== b.skillPriority
      ? a.skillPriority - b.skillPriority
      : a.createdAt.localeCompare(b.createdAt)
  );

  // Simple round-robin: use hour of day as tiebreaker so it rotates over time
  const primaryPriority = candidates[0].skillPriority;
  const topCandidates = candidates.filter((c) => c.skillPriority === primaryPriority);
  const slot = Math.floor(Date.now() / 60_000) % topCandidates.length;
  return topCandidates[slot].id;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ─────────────────────────────────────────────────────────────────────────────
   AI keyword suggestion
   Called after an intent correction is logged. Reads the subject, body, and
   closure note and suggests keywords to add to the corrected intent's list.
───────────────────────────────────────────────────────────────────────────── */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4o-mini";

export async function suggestKeywordsFromCorrection(params: {
  correctedIntent: string;
  subject: string;
  bodyPreview: string;
  closureNote: string;
  existingKeywords: string[];
}): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const systemPrompt = `You are an expert at building keyword classification rules for a customer support inbox.
Your job is to suggest new trigger keywords for a support intent category based on a real customer email that was incorrectly classified.
Return ONLY a JSON object: { "keywords": ["word1", "word2", ...] }
Rules:
- Suggest 3-7 concise keywords or short phrases (max 4 words each)
- Focus on terms specific to this intent that would not appear in other intents
- Do NOT include generic words like "help", "please", "thank you"
- Do NOT repeat keywords already in the existing list
- Lowercase only`.trim();

  const userPrompt = [
    `Intent to add keywords to: "${params.correctedIntent}"`,
    `Existing keywords: ${params.existingKeywords.length > 0 ? params.existingKeywords.join(", ") : "none"}`,
    ``,
    `Customer email subject: ${params.subject || "(none)"}`,
    `Customer email body: ${params.bodyPreview || "(none)"}`,
    params.closureNote ? `Agent closure note: ${params.closureNote}` : "",
    ``,
    `Suggest keywords that would have correctly classified this email as "${params.correctedIntent}".`,
  ].filter(Boolean).join("\n");

  try {
    const res = await fetchWithCircuitBreaker(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    }, { key: "openai-intent-keywords", timeoutMs: 20_000 });

    if (!res.ok) return [];

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { keywords?: unknown };
    const kws = parsed.keywords;
    if (!Array.isArray(kws)) return [];
    return kws
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .map((k) => k.toLowerCase().trim())
      .slice(0, 10);
  } catch {
    return [];
  }
}
