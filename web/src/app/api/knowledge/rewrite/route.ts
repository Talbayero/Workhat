import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";

/* ─────────────────────────────────────────────
   POST /api/knowledge/rewrite

   Takes a knowledge entry draft (body + category) and rewrites it
   to be optimally structured for AI semantic retrieval.

   Body: { body: string; category: string; title?: string }
   Response: { rewritten: string }
───────────────────────────────────────────── */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4o-mini";

const CATEGORY_GUIDANCE: Record<string, string> = {
  policy: "Write as a clear, authoritative policy document. Use definitive language ('Customers are eligible...', 'Agents must...'). State rules before exceptions. List edge cases explicitly.",
  sop: "Write as a numbered step-by-step procedure. Each step must be a single, actionable instruction. Include decision points as 'If X, then Y' branches. Add a brief intro and any prerequisites.",
  tone: "Write as a concrete tone guide with dos and don'ts. Include 2–3 example phrases for each guideline. Contrast what to say vs. what to avoid. Keep it practical, not abstract.",
  product: "Write as a factual product reference. Cover what it does, key capabilities, limitations, and common customer questions. Use plain language — no internal jargon.",
  escalation: "Write as a clear escalation protocol. Specify trigger conditions, who to contact, what information to include, and expected response time. Use numbered steps.",
};

const SYSTEM_PROMPT = `You are an expert at writing knowledge base content for AI support agent systems.

Your job is to rewrite a draft entry so it is:
- Optimally structured for semantic retrieval (clear headings, logical flow)
- Immediately actionable for an AI drafting customer replies
- Free of ambiguity, filler text, and vague language
- Formatted with double line breaks between sections (no markdown headers — plain text only)

You will receive the category and raw draft. Rewrite the content according to the category-specific guidance provided. Preserve all facts and policies from the original — do not invent new information.

Respond with ONLY the rewritten content. No preamble, no explanation.`.trim();

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, org_id")
    .eq("auth_user_id", user.id)
    .single();
  return data as { id: string; org_id: string } | null;
}

export async function POST(req: NextRequest) {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { body?: string; category?: string; title?: string };
  const content = body.body?.trim();
  const category = body.category?.trim() ?? "sop";
  const title = body.title?.trim() ?? "";

  if (!content) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (content.length > 8000) {
    return NextResponse.json({ error: "Content is too long to rewrite (max 8000 characters)." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI rewrite is not configured." }, { status: 503 });

  const categoryGuidance = CATEGORY_GUIDANCE[category] ?? CATEGORY_GUIDANCE.sop;

  const userPrompt = [
    `Category: ${category}`,
    title ? `Entry title: ${title}` : "",
    `Category-specific guidance: ${categoryGuidance}`,
    "",
    "Original draft:",
    content,
  ].filter(Boolean).join("\n");

  const reqBody = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
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

  const data = await res.json() as { choices: { message: { content: string } }[] };
  const rewritten = data.choices?.[0]?.message?.content?.trim();

  if (!rewritten) {
    return NextResponse.json({ error: "AI returned an empty response." }, { status: 502 });
  }

  return NextResponse.json({ rewritten });
}
