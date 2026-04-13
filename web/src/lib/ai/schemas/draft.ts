/**
 * JSON Schema for the AI draft structured output.
 * Passed to OpenAI's response_format so the model is constrained to this shape.
 * Also contains a runtime validator that replaces Zod for this project.
 */

import type { AIDraftOutput, ConfidenceLevel } from "@/lib/ai/types";

// ── JSON Schema (passed to OpenAI) ────────────────────────────────────────────

export const DRAFT_JSON_SCHEMA = {
  name: "draft_reply",
  strict: true,
  schema: {
    type: "object",
    properties: {
      draftText: {
        type: "string",
        description: "The full reply text to send to the customer.",
      },
      rationale: {
        type: "string",
        description:
          "1-2 sentences explaining why this response addresses the customer's issue.",
      },
      confidenceLevel: {
        type: "string",
        enum: ["green", "yellow", "red"],
        description:
          "green = high confidence; yellow = review recommended; red = low confidence, edit carefully.",
      },
      riskFlags: {
        type: "array",
        items: { type: "string" },
        description:
          "Short labels for anything risky or uncertain in the draft (e.g. 'missing_order_status', 'policy_exception_required').",
      },
      missingContext: {
        type: "array",
        items: { type: "string" },
        description:
          "Information the AI could not find that would improve the response (e.g. 'tracking number', 'account tier').",
      },
      recommendedTags: {
        type: "array",
        items: { type: "string" },
        description:
          "Tags that should be applied to this conversation (e.g. 'shipping', 'refund', 'billing').",
      },
    },
    required: [
      "draftText",
      "rationale",
      "confidenceLevel",
      "riskFlags",
      "missingContext",
      "recommendedTags",
    ],
    additionalProperties: false,
  },
} as const;

// ── Runtime validator (no Zod dependency) ─────────────────────────────────────

const VALID_CONFIDENCE: Set<ConfidenceLevel> = new Set(["green", "yellow", "red"]);

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((v) => typeof v === "string");
}

/**
 * Validates and narrows an unknown JSON blob to AIDraftOutput.
 * Throws a descriptive error if the shape is wrong.
 */
export function parseDraftOutput(raw: unknown): AIDraftOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Draft output is not an object");
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.draftText !== "string" || !obj.draftText.trim()) {
    throw new Error("draftText is required and must be a non-empty string");
  }
  if (typeof obj.rationale !== "string") {
    throw new Error("rationale must be a string");
  }
  if (!VALID_CONFIDENCE.has(obj.confidenceLevel as ConfidenceLevel)) {
    throw new Error(`confidenceLevel must be green | yellow | red, got "${obj.confidenceLevel}"`);
  }
  if (!isStringArray(obj.riskFlags)) {
    throw new Error("riskFlags must be an array of strings");
  }
  if (!isStringArray(obj.missingContext)) {
    throw new Error("missingContext must be an array of strings");
  }
  if (!isStringArray(obj.recommendedTags)) {
    throw new Error("recommendedTags must be an array of strings");
  }

  return {
    draftText: obj.draftText,
    rationale: obj.rationale,
    confidenceLevel: obj.confidenceLevel as ConfidenceLevel,
    riskFlags: obj.riskFlags,
    missingContext: obj.missingContext,
    recommendedTags: obj.recommendedTags,
  };
}
