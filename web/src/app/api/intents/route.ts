import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateIntentCache } from "@/ai/workflows/intent-classifier";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { logAudit } from "@/lib/security/audit-logger";

/* ─────────────────────────────────────────────
   GET  /api/intents  — list org intents
   POST /api/intents  — create intent (manager+)
───────────────────────────────────────────── */

const VALID_PRIORITY_LEVELS = new Set(["high", "normal", "low"]);
const MAX_INTENT_NAME_LENGTH = 80;
const MAX_COLOR_LENGTH = 20;
const MAX_SKILL_REQUIRED_LENGTH = 80;
const MAX_KEYWORD_COUNT = 50;
const MAX_KEYWORD_LENGTH = 50;

function normalizeKeywords(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((keyword) => typeof keyword !== "string")) {
    return null;
  }

  const keywords = [...new Set(value.map((keyword) => (keyword as string).trim()).filter(Boolean))];
  if (keywords.length > MAX_KEYWORD_COUNT) return null;
  if (keywords.some((keyword) => keyword.length > MAX_KEYWORD_LENGTH)) return null;
  return keywords;
}

function normalizeOptionalString(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

export async function GET() {
  const appUser = await getCurrentAppUser({ label: "intents", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[intents] admin client init failed:", message);
    return NextResponse.json(
      { error: "Intent settings are unavailable — admin database key is not configured." },
      { status: 503 }
    );
  }

  const { data, error } = await admin
    .from("intents")
    .select("id, name, color, keywords, skill_required, priority_order, priority_level, created_at")
    .eq("org_id", appUser.org_id)
    .order("priority_order", { ascending: true });

  if (error) {
    console.error("[intents] fetch failed:", error.message);
    return NextResponse.json({ error: "Unable to fetch intents." }, { status: 500 });
  }

  return NextResponse.json({ intents: data ?? [] });
}

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "intents", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireCapability(appUser, "ai.configure", "intents");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = normalizeOptionalString(body.name);
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > MAX_INTENT_NAME_LENGTH) return NextResponse.json({ error: "Intent name is too long." }, { status: 422 });

  const color = normalizeOptionalString(body.color);
  if (color === undefined) return NextResponse.json({ error: "color must be text" }, { status: 400 });
  if (color && color.length > MAX_COLOR_LENGTH) return NextResponse.json({ error: "Color value is too long." }, { status: 422 });

  const skillRequired = normalizeOptionalString(body.skill_required);
  if (skillRequired === undefined) return NextResponse.json({ error: "skill_required must be text" }, { status: 400 });
  if (skillRequired && skillRequired.length > MAX_SKILL_REQUIRED_LENGTH) return NextResponse.json({ error: "Skill name is too long." }, { status: 422 });

  const keywords = normalizeKeywords(body.keywords);
  if (keywords === null) return NextResponse.json({ error: `keywords must be a list of text values (max ${MAX_KEYWORD_COUNT}, each max ${MAX_KEYWORD_LENGTH} characters)` }, { status: 400 });

  const priorityOrder = body.priority_order;
  if (priorityOrder !== undefined && (typeof priorityOrder !== "number" || !Number.isFinite(priorityOrder))) {
    return NextResponse.json({ error: "priority_order must be a finite number" }, { status: 400 });
  }

  let priorityLevel = "normal";
  if (body.priority_level !== undefined) {
    if (typeof body.priority_level !== "string" || !VALID_PRIORITY_LEVELS.has(body.priority_level)) {
      return NextResponse.json({ error: "priority_level must be high, normal, or low" }, { status: 400 });
    }
    priorityLevel = body.priority_level;
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[intents] admin client init failed:", message);
    return NextResponse.json(
      { error: "Intent settings are unavailable — admin database key is not configured." },
      { status: 503 }
    );
  }

  const { data, error } = await admin
    .from("intents")
    .insert({
      org_id: appUser.org_id,
      name,
      color: color || "#78a17a",
      keywords,
      skill_required: skillRequired,
      priority_order: typeof priorityOrder === "number" ? priorityOrder : 100,
      priority_level: priorityLevel,
    })
    .select("id, name, color, keywords, skill_required, priority_order, priority_level, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An intent with that name already exists." }, { status: 409 });
    }
    console.error("[intents] insert failed:", error.message);
    return NextResponse.json({ error: "Unable to create intent." }, { status: 500 });
  }

  invalidateIntentCache(appUser.org_id);
  void logAudit({
    action: "intent.created",
    orgId: appUser.org_id,
    actorId: appUser.id,
    actorRole: appUser.role,
    resourceType: "intent",
    resourceId: data.id,
    resourceLabel: data.name,
    req,
  });
  return NextResponse.json({ intent: data }, { status: 201 });
}

