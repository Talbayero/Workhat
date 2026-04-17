/**
 * LLM-powered knowledge entry generation.
 *
 * Two workflows:
 *   1. entryFromCorrection — given an AI draft and the agent's final reply,
 *      generate a knowledge entry that captures what the AI got wrong or missed.
 *
 *   2. entriesFromGapPattern — given a cluster of similar edit analyses,
 *      generate a knowledge entry suggestion that would prevent the pattern.
 *
 * Both use gpt-4o-mini (cheap, fast) and return structured JSON via the
 * same circuit-breaker wrapper used everywhere else in the AI layer.
 */

import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4o-mini";

// ── Shared output type ────────────────────────────────────────────────────────

export type GeneratedKnowledgeEntry = {
  title: string;
  summary: string;
  body: string;
  category: "policy" | "sop" | "tone" | "product" | "escalation";
  tags: string[];
};

// ── Shared call helper ────────────────────────────────────────────────────────

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  circuitKey: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 800,
  };

  const res = await fetchWithCircuitBreaker(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  }, { key: circuitKey, timeoutMs: 25_000 });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");
  return content;
}

function parseEntry(raw: string): GeneratedKnowledgeEntry {
  const obj = JSON.parse(raw) as Partial<GeneratedKnowledgeEntry>;

  const validCategories = ["policy", "sop", "tone", "product", "escalation"];
  const category = validCategories.includes(obj.category ?? "")
    ? (obj.category as GeneratedKnowledgeEntry["category"])
    : "sop";

  return {
    title: String(obj.title ?? "").trim() || "Untitled entry",
    summary: String(obj.summary ?? "").trim(),
    body: String(obj.body ?? "").trim(),
    category,
    tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [],
  };
}

// ── Workflow 1: Entry from correction ─────────────────────────────────────────

const FROM_CORRECTION_SYSTEM = `You are an expert at writing customer support knowledge base entries.

An AI draft reply was edited by a human support agent before being sent. Your job is to analyse the correction and write a knowledge base entry that captures the information the AI was missing or got wrong — so future drafts don't repeat the same mistake.

Rules:
- Write a complete, actionable knowledge entry — not meta-commentary about the edit
- The entry should teach the AI what it needs to know, written as a clear policy or SOP
- Category must be one of: policy, sop, tone, product, escalation
- Tags should be 2–4 short keywords relevant to the topic
- Respond ONLY with a valid JSON object with keys: title, summary, body, category, tags`.trim();

export async function entryFromCorrection(
  draftText: string,
  finalText: string,
  likelyReason: string,
  categories: string[]
): Promise<GeneratedKnowledgeEntry> {
  const userPrompt = `## AI Draft (what the AI wrote)
${draftText}

## Final Reply (what the agent sent)
${finalText}

## Edit Analysis
Categories: ${categories.join(", ")}
Likely reason: ${likelyReason}

Write a knowledge base entry that, if it had existed before this conversation, would have led the AI to produce a reply closer to what the agent sent.`;

  const raw = await callLLM(FROM_CORRECTION_SYSTEM, userPrompt, "openai-knowledge-gen-correction");
  return parseEntry(raw);
}

// ── Workflow 2: Entry from gap pattern ────────────────────────────────────────

const FROM_GAP_SYSTEM = `You are an expert at identifying systemic gaps in a customer support AI's knowledge base.

You will receive a cluster of edit analysis records showing a recurring pattern where human agents had to correct AI drafts in a similar way. Your job is to generate a knowledge base entry that would close this gap.

Rules:
- Write the entry as a clear, actionable policy or SOP that directly addresses the pattern
- Do not describe the problem — write the solution as a reference document
- Category must be one of: policy, sop, tone, product, escalation
- Tags should be 2–4 short keywords
- Respond ONLY with a valid JSON object with keys: title, summary, body, category, tags`.trim();

export type GapPattern = {
  category: string;
  count: number;
  sampleReasons: string[];
};

export async function entryFromGapPattern(
  pattern: GapPattern
): Promise<GeneratedKnowledgeEntry> {
  const userPrompt = `## Recurring Edit Pattern
Category: ${pattern.category}
Occurrences in the last 30 days: ${pattern.count}

## Sample reasons agents gave for editing:
${pattern.sampleReasons.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Based on this pattern, write a knowledge base entry that would give the AI the information it needs to avoid these corrections in the future.`;

  const raw = await callLLM(FROM_GAP_SYSTEM, userPrompt, "openai-knowledge-gen-gap");
  return parseEntry(raw);
}
