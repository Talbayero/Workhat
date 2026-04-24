import { NextRequest, NextResponse } from "next/server";
import {
  buildKnowledgeRewriteUserPrompt,
  KNOWLEDGE_REWRITE_CATEGORY_GUIDANCE,
  KNOWLEDGE_REWRITE_SYSTEM_PROMPT,
} from "@/ai/prompts/knowledge-rewrite";
import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";

/* ─────────────────────────────────────────────
   POST /api/knowledge/rewrite

   Takes a knowledge entry draft (body + category) and rewrites it
   to be optimally structured for AI semantic retrieval.

   Body: { body: string; category: string; title?: string }
   Response: { rewritten: string }
───────────────────────────────────────────── */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4o-mini";

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "knowledge/rewrite", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireCapability(appUser, "knowledge.edit", "knowledge/rewrite");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.body != null && typeof body.body !== "string") {
    return NextResponse.json({ error: "body must be text." }, { status: 400 });
  }
  if (body.category != null && typeof body.category !== "string") {
    return NextResponse.json({ error: "category must be text." }, { status: 400 });
  }
  if (body.title != null && typeof body.title !== "string") {
    return NextResponse.json({ error: "title must be text." }, { status: 400 });
  }

  const VALID_CATEGORIES = new Set(["policy", "sop", "tone", "product", "escalation"]);

  const content = body.body?.trim();
  const rawCategory = body.category?.trim() ?? "sop";
  // Enforce allowlist before interpolating category into the prompt
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : "sop";
  const title = (body.title?.trim() ?? "").slice(0, 200); // cap title to prevent prompt stuffing

  if (!content) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (content.length > 8000) {
    return NextResponse.json({ error: "Content is too long to rewrite (max 8000 characters)." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI rewrite is not configured." }, { status: 503 });

  const categoryGuidance = KNOWLEDGE_REWRITE_CATEGORY_GUIDANCE[category] ?? KNOWLEDGE_REWRITE_CATEGORY_GUIDANCE.sop;

  // Use XML delimiters to prevent user-controlled content from leaking into
  // the instruction portion of the prompt (prompt injection defence).
  const userPrompt = buildKnowledgeRewriteUserPrompt({
    category,
    categoryGuidance,
    title,
    content,
  });

  const reqBody = {
    model: MODEL,
    messages: [
      { role: "system", content: KNOWLEDGE_REWRITE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1200,
  };

  let res: Response;
  try {
    res = await fetchWithCircuitBreaker(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(reqBody),
    }, { key: "openai-knowledge-rewrite", timeoutMs: 30_000 });
  } catch (err) {
    console.error("[knowledge/rewrite] fetch error:", err);
    return NextResponse.json({ error: "AI rewrite timed out. Please try again." }, { status: 502 });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error("[knowledge/rewrite] OpenAI error:", res.status, errText);
    return NextResponse.json({ error: "AI rewrite failed. Please try again." }, { status: 502 });
  }

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = await res.json() as { choices?: { message?: { content?: string } }[] };
  } catch {
    return NextResponse.json({ error: "AI rewrite returned invalid JSON." }, { status: 502 });
  }
  const rewritten = data.choices?.[0]?.message?.content?.trim();

  if (!rewritten) {
    return NextResponse.json({ error: "AI returned an empty response." }, { status: 502 });
  }

  return NextResponse.json({ rewritten });
}
