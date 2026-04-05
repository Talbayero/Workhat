"use client";

// ─── Edit Analysis ─────────────────────────────────────────────────────────────
// Captures the diff between an AI draft and the agent's final reply, then
// classifies the edit type. Phase 1: in-memory store. Phase 2: POST to
// /api/conversations/:id/edit-analysis → Supabase edit_analyses table.

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

// In-memory store — replaced by Supabase in Phase 2
const editLog: EditRecord[] = [];

export function getEditLog(): EditRecord[] {
  return editLog;
}

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

const TONE_SIGNALS = [
  "understand", "apolog", "frustrat", "sorry", "thank", "appreciate",
  "absolutely", "of course", "happy to",
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

  editLog.push(record);
  return record;
}

// ── Aggregate stats (used by Dashboard) ───────────────────────────────────────

export type EditStats = {
  totalEdits: number;
  acceptanceRate: number;      // % of drafts sent unchanged
  avgEditIntensity: number;    // avg intensity across non-accepted edits
  topEditType: EditType | null;
  byType: Record<EditType, number>;
};

export function computeEditStats(): EditStats {
  if (editLog.length === 0) {
    return {
      totalEdits: 0,
      acceptanceRate: 0,
      avgEditIntensity: 0,
      topEditType: null,
      byType: {
        accepted: 0,
        tone: 0,
        policy: 0,
        missing_context: 0,
        factual: 0,
        structure: 0,
        full_rewrite: 0,
      },
    };
  }

  const byType: Record<EditType, number> = {
    accepted: 0,
    tone: 0,
    policy: 0,
    missing_context: 0,
    factual: 0,
    structure: 0,
    full_rewrite: 0,
  };

  let totalIntensity = 0;
  let nonAccepted = 0;

  for (const rec of editLog) {
    byType[rec.editType]++;
    if (rec.editType !== "accepted") {
      totalIntensity += rec.editIntensity;
      nonAccepted++;
    }
  }

  const acceptanceRate = Math.round((byType.accepted / editLog.length) * 100);
  const avgEditIntensity = nonAccepted > 0
    ? Math.round(totalIntensity / nonAccepted)
    : 0;

  // Top non-accepted edit type
  const ranked = (Object.entries(byType) as [EditType, number][])
    .filter(([t]) => t !== "accepted")
    .sort(([, a], [, b]) => b - a);

  const topEditType = ranked[0]?.[1] > 0 ? ranked[0][0] : null;

  return {
    totalEdits: editLog.length,
    acceptanceRate,
    avgEditIntensity,
    topEditType,
    byType,
  };
}
