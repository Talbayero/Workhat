/**
 * Edit analysis pipeline.
 *
 * Three-step process per the spec:
 *   Step 1: Deterministic diff — always runs, no AI needed
 *   Step 2: Heuristic pre-classification — fast, catches obvious categories
 *   Step 3: LLM-based classification — runs after the diff, uses it as input
 *
 * This module exports pure functions so each step is independently testable.
 */

// ── Shared types ──────────────────────────────────────────────────────────────

export type EditCategory =
  | "accepted"
  | "tone"
  | "policy"
  | "missing_context"
  | "factual"
  | "structure"
  | "full_rewrite";

export type DiffResult = {
  editDistanceScore: number;   // Levenshtein-based, normalised 0–1 (1 = identical)
  changePercent: number;       // 0–100 percentage of draft that changed
  insertedWords: string[];
  deletedWords: string[];
  changedSpanCount: number;
  rawDiffJson: object;
};

export type EditAnalysisOutput = {
  categories: EditCategory[];
  likelyReasonSummary: string;
  classificationConfidence: number;  // 0–1
  shouldEscalate: boolean;
};

export type FullAnalysisResult = DiffResult & EditAnalysisOutput;

// ── Step 1: Deterministic diff ────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Word-level Levenshtein similarity: 1 = identical, 0 = nothing in common.
 * Lightweight enough to run synchronously on reply-length text.
 */
function wordSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  return intersection / Math.max(setA.size, setB.size, 1);
}

/**
 * Count runs of consecutive words that appear in the final but not the draft.
 * A rough proxy for "number of new ideas inserted".
 */
function countChangedSpans(draftTokens: string[], finalTokens: string[]): number {
  const draftSet = new Set(draftTokens);
  let spans = 0;
  let inSpan = false;
  for (const word of finalTokens) {
    if (!draftSet.has(word)) {
      if (!inSpan) { spans++; inSpan = true; }
    } else {
      inSpan = false;
    }
  }
  return spans;
}

export function computeDiff(draftText: string, finalText: string): DiffResult {
  const draftTokens = tokenize(draftText);
  const finalTokens = tokenize(finalText);

  const similarity = wordSimilarity(draftTokens, finalTokens);
  const changePercent = Math.round((1 - similarity) * 100);
  const editDistanceScore = Math.round(similarity * 100) / 100;

  const draftSet = new Set(draftTokens);
  const finalSet = new Set(finalTokens);

  const insertedWords = [...finalSet].filter((w) => !draftSet.has(w)).slice(0, 30);
  const deletedWords = [...draftSet].filter((w) => !finalSet.has(w)).slice(0, 30);
  const changedSpanCount = countChangedSpans(draftTokens, finalTokens);

  return {
    editDistanceScore,
    changePercent,
    insertedWords,
    deletedWords,
    changedSpanCount,
    rawDiffJson: {
      draftWordCount: draftTokens.length,
      finalWordCount: finalTokens.length,
      insertedWords,
      deletedWords,
      changedSpanCount,
      similarity,
    },
  };
}

// ── Step 2: Heuristic pre-classification ──────────────────────────────────────

const POLICY_SIGNALS = [
  "policy", "exception", "eligible", "not eligible", "waive",
  "restocking", "return", "refund", "approval", "escalate",
  "per our", "according to", "unfortunately", "unable to",
];

const CONTEXT_SIGNALS = [
  "order number", "order #", "account", "carrier", "tracking",
  "eta", "date", "history", "previous", "last time", "your record",
  "reference", "case", "ticket",
];

const FACTUAL_SIGNALS = [
  "actually", "incorrect", "wrong", "should be", "the correct",
  "updated", "changed", "now shows", "our records show",
];

function hasSignal(text: string, signals: string[]): boolean {
  const lower = text.toLowerCase();
  return signals.some((s) => lower.includes(s));
}

/**
 * Fast heuristic classification — runs before the LLM call.
 * Returns a best-guess category. The LLM can refine or override.
 */
export function heuristicClassify(
  draftText: string,
  finalText: string,
  diff: DiffResult
): { categories: EditCategory[]; confidence: number } {
  if (diff.changePercent === 0) {
    return { categories: ["accepted"], confidence: 1.0 };
  }
  if (diff.changePercent >= 85) {
    return { categories: ["full_rewrite"], confidence: 0.9 };
  }

  const insertedText = diff.insertedWords.join(" ");
  const categories: EditCategory[] = [];

  if (hasSignal(insertedText, POLICY_SIGNALS)) categories.push("policy");
  if (hasSignal(insertedText, CONTEXT_SIGNALS)) categories.push("missing_context");
  if (hasSignal(insertedText, FACTUAL_SIGNALS)) categories.push("factual");

  // Structural: similar length and low changePercent but reordered
  const draftLen = draftText.trim().split(/\s+/).length;
  const finalLen = finalText.trim().split(/\s+/).length;
  const lenRatio = Math.abs(draftLen - finalLen) / Math.max(draftLen, 1);

  if (categories.length === 0) {
    if (diff.changePercent < 25 && lenRatio < 0.15) categories.push("tone");
    else if (diff.changePercent < 50 && lenRatio < 0.1) categories.push("structure");
    else categories.push("missing_context");
  }

  // Confidence is lower when multiple signals fire or intensity is ambiguous
  const confidence = categories.length === 1 && diff.changePercent < 60 ? 0.65 : 0.45;
  return { categories, confidence };
}

// ── Step 3: LLM-based classification ─────────────────────────────────────────

import { ANALYSIS_JSON_SCHEMA, parseAnalysisOutput } from "@/lib/ai/schemas/analysis";

/**
 * Intentionally separate from OPENAI_DEFAULT_MODEL — analysis is a cheaper,
 * high-volume classification task. gpt-4o-mini is accurate enough and ~20x cheaper.
 * Override with OPENAI_ANALYSIS_MODEL env var if needed.
 */
const OPENAI_ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4o-mini";

const ANALYSIS_SYSTEM_PROMPT = `You are an expert at analysing how human support agents edit AI-generated reply drafts.
Your job is to classify WHY the agent changed the draft and whether the pattern suggests a knowledge gap.

Categories (use one or more):
- accepted: agent sent the draft unchanged
- tone: only wording/style changed, core content is the same
- policy: agent corrected a policy or rule the AI got wrong or missed
- missing_context: agent added specific information the AI didn't have (order ID, dates, names, etc.)
- factual: agent fixed an incorrect fact
- structure: agent reorganised without changing substance
- full_rewrite: agent scrapped and wrote from scratch

Be precise: only flag "policy" if a clear policy error was corrected, not just any change.`.trim();

export async function llmClassifyEdit(
  draftText: string,
  finalText: string,
  diff: DiffResult,
  heuristic: ReturnType<typeof heuristicClassify>
): Promise<EditAnalysisOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fall back to heuristic if no key
    return {
      categories: heuristic.categories,
      likelyReasonSummary: `Heuristic classification: ${heuristic.categories.join(", ")}. ${diff.changePercent}% of draft was changed.`,
      classificationConfidence: heuristic.confidence,
      shouldEscalate: heuristic.categories.some((c) =>
        ["policy", "factual", "full_rewrite"].includes(c)
      ),
    };
  }

  const userPrompt = `## AI Draft
${draftText}

## Final Reply Sent by Agent
${finalText}

## Diff Summary
- Change percentage: ${diff.changePercent}%
- Words inserted: ${diff.insertedWords.slice(0, 15).join(", ") || "none"}
- Words deleted: ${diff.deletedWords.slice(0, 15).join(", ") || "none"}
- Changed spans: ${diff.changedSpanCount}

## Heuristic Pre-Classification
Suggested categories: ${heuristic.categories.join(", ")}
Heuristic confidence: ${Math.round(heuristic.confidence * 100)}%

Classify this edit. You may confirm, refine, or override the heuristic suggestion.`;

  const body = {
    model: OPENAI_ANALYSIS_MODEL,
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: ANALYSIS_JSON_SCHEMA,
    },
    temperature: 0.1, // very low — we want deterministic classifications
    max_tokens: 400,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Non-fatal: fall back to heuristic
    console.warn("[analysis] OpenAI call failed, using heuristic");
    return {
      categories: heuristic.categories,
      likelyReasonSummary: `Heuristic: ${heuristic.categories.join(", ")}. ${diff.changePercent}% changed.`,
      classificationConfidence: heuristic.confidence,
      shouldEscalate: false,
    };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty analysis response");

  return parseAnalysisOutput(JSON.parse(content));
}

// ── Full pipeline ─────────────────────────────────────────────────────────────

export async function runEditAnalysis(
  draftText: string,
  finalText: string
): Promise<FullAnalysisResult> {
  // Step 1
  const diff = computeDiff(draftText, finalText);

  // Step 2
  const heuristic = heuristicClassify(draftText, finalText, diff);

  // Step 3 — skip LLM for accepted drafts (no point classifying zero edits)
  let aiResult: EditAnalysisOutput;
  if (heuristic.categories[0] === "accepted") {
    aiResult = {
      categories: ["accepted"],
      likelyReasonSummary: "Agent sent the AI draft without changes.",
      classificationConfidence: 1.0,
      shouldEscalate: false,
    };
  } else {
    aiResult = await llmClassifyEdit(draftText, finalText, diff, heuristic);
  }

  return {
    ...diff,
    ...aiResult,
  };
}
