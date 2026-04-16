"use client";

// ─── Client-side Edit Analysis (UI-only) ──────────────────────────────────────
// Provides lightweight in-browser diff + heuristic classification used ONLY
// for the immediate agent-facing toast after a reply is sent (thread-workspace).
//
// The authoritative edit analysis (LLM-backed, persisted to Supabase) runs
// server-side in the reply route → triggerEditAnalysis → lib/ai/analysis.ts.
// This module no longer maintains a persistent in-memory log — stats come
// from GET /api/conversations/:id/edit-analysis (backed by edit_analyses table).

export type EditType =
  | "accepted"        // Agent sent draft unchanged
  | "tone"            // Wording changed but core content is the same
  | "policy"          // Agent corrected a policy/rule the AI missed
  | "missing_context" // Agent added information the AI didn't have
  | "factual"         // Agent fixed an incorrect fact
  | "structure"       // Agent reorganised without changing substance
  | "full_rewrite";   // Agent scrapped and wrote from scratch

export type EditRecord = {
  id: string;
  conversationId: string;
  timestamp: string;
  aiDraftText: string;
  finalText: string;
  editType: EditType;
  editIntensity: number; // 0–100: % of AI draft that was changed
  agentId: string;
};


// ── Diff helpers ──────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Rough word-level similarity: shared words / max words */
function wordSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const shared = [...setA].filter((w) => setB.has(w)).length;
  return shared / Math.max(setA.size, setB.size, 1);
}

/** 0–100 percentage of draft that was edited */
export function computeEditIntensity(draft: string, final: string): number {
  if (!draft.trim()) return 100;
  const similarity = wordSimilarity(draft, final);
  return Math.round((1 - similarity) * 100);
}

// ── Classification heuristics ─────────────────────────────────────────────────
// Real version: pass diff to LLM with few-shot examples.
// Phase 1: rule-based on signal words and intensity.

const POLICY_SIGNALS = [
  "policy", "exception", "eligible", "not eligible", "waive", "restocking",
  "return", "refund", "approval", "escalate", "per our", "according to",
];

const CONTEXT_SIGNALS = [
  "order number", "account", "carrier", "scan", "tracking", "eta", "date",
  "history", "previous", "last time", "your record",
];

function hasSignal(text: string, signals: string[]): boolean {
  const lower = text.toLowerCase();
  return signals.some((s) => lower.includes(s));
}

export function classifyEdit(
  draft: string,
  final: string,
  intensity: number,
): EditType {
  if (intensity === 0) return "accepted";
  if (intensity >= 85) return "full_rewrite";

  const addedWords = final
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !draft.toLowerCase().includes(w));

  const addedText = addedWords.join(" ");

  if (hasSignal(addedText, POLICY_SIGNALS)) return "policy";
  if (hasSignal(addedText, CONTEXT_SIGNALS)) return "missing_context";

  // Structural: similar length, different order
  const draftLen = wordCount(draft);
  const finalLen = wordCount(final);
  const lenRatio = Math.abs(draftLen - finalLen) / Math.max(draftLen, 1);
  if (intensity < 30 && lenRatio < 0.1) return "tone";
  if (intensity < 50 && lenRatio < 0.15) return "structure";

  // Default: tone if low intensity, missing_context if high
  return intensity < 50 ? "tone" : "missing_context";
}

// ── Record an edit ─────────────────────────────────────────────────────────────

export function recordEdit(
  conversationId: string,
  aiDraftText: string,
  finalText: string,
  agentId = "current-agent",
): EditRecord {
  const intensity = computeEditIntensity(aiDraftText, finalText);
  const editType = classifyEdit(aiDraftText, finalText, intensity);

  const record: EditRecord = {
    id: `edit-${Date.now()}`,
    conversationId,
    timestamp: new Date().toISOString(),
    aiDraftText,
    finalText,
    editType,
    editIntensity: intensity,
    agentId,
  };

  return record;
}
