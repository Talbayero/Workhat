/**
 * JSON Schema for the edit analysis structured output.
 * Passed to OpenAI so the model returns a machine-readable classification
 * of why the agent changed the AI draft.
 */

import type { EditAnalysisOutput } from "@/lib/ai/analysis";

// ── JSON Schema (passed to OpenAI) ────────────────────────────────────────────

export const ANALYSIS_JSON_SCHEMA = {
  name: "edit_analysis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "accepted",
            "tone",
            "policy",
            "missing_context",
            "factual",
            "structure",
            "full_rewrite",
          ],
        },
        description:
          "One or more categories that describe why the agent edited the AI draft. Can be multiple.",
      },
      likelyReasonSummary: {
        type: "string",
        description:
          "1-2 sentence human-readable explanation of what changed and why.",
      },
      classificationConfidence: {
        type: "number",
        description:
          "0.0 to 1.0 confidence score for the classification. 1.0 = very certain.",
      },
      shouldEscalate: {
        type: "boolean",
        description:
          "True if the edits suggest a knowledge gap or systemic issue that a manager should review.",
      },
    },
    required: [
      "categories",
      "likelyReasonSummary",
      "classificationConfidence",
      "shouldEscalate",
    ],
    additionalProperties: false,
  },
} as const;

// ── Runtime validator ─────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set([
  "accepted",
  "tone",
  "policy",
  "missing_context",
  "factual",
  "structure",
  "full_rewrite",
]);

export function parseAnalysisOutput(raw: unknown): EditAnalysisOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Analysis output is not an object");
  }
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.categories) || !obj.categories.every((c) => VALID_CATEGORIES.has(c as string))) {
    throw new Error("categories must be an array of valid edit type strings");
  }
  if (typeof obj.likelyReasonSummary !== "string") {
    throw new Error("likelyReasonSummary must be a string");
  }
  if (typeof obj.classificationConfidence !== "number") {
    throw new Error("classificationConfidence must be a number");
  }
  if (typeof obj.shouldEscalate !== "boolean") {
    throw new Error("shouldEscalate must be a boolean");
  }

  return {
    categories: obj.categories as EditAnalysisOutput["categories"],
    likelyReasonSummary: obj.likelyReasonSummary,
    classificationConfidence: obj.classificationConfidence,
    shouldEscalate: obj.shouldEscalate,
  };
}
