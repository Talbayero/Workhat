/**
 * Shared types for the AI layer.
 * Used by API routes, provider implementations, and the analysis pipeline.
 */

export type ConfidenceLevel = "green" | "yellow" | "red";

// ── Draft generation ──────────────────────────────────────────────────────────

/** Structured output returned by the AI draft workflow. */
export type AIDraftOutput = {
  draftText: string;
  rationale: string;
  confidenceLevel: ConfidenceLevel;
  riskFlags: string[];
  missingContext: string[];
  recommendedTags: string[];
};

/** Full result after calling the provider and (optionally) persisting to DB. */
export type AIDraftResult = AIDraftOutput & {
  /** DB row id — null if the draft was not persisted (e.g. no auth session). */
  id: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  requestTokens: number | null;
  responseTokens: number | null;
  latencyMs: number;
};

// ── Context assembled before calling the AI ───────────────────────────────────

export type MessageContext = {
  role: "customer" | "agent" | "ai" | "internal";
  author: string;
  body: string;
  sentAt: string;
};

export type KnowledgeSnippet = {
  id: string;
  entryId?: string;
  title: string;
  excerpt: string;
  entryType: string;
};

export type OrgPolicyEntry = {
  title: string;
  body: string;
  category: string;
};

export type ConversationContext = {
  conversationId: string;
  subject: string;
  status: string;
  riskLevel: string;
  contact: {
    fullName: string;
    email: string;
    tier: string;
    notes: string;
  };
  company: {
    name: string;
    industry: string;
  } | null;
  messages: MessageContext[];
  knowledgeSnippets: KnowledgeSnippet[];
  /** Org-specific tone guides and SOPs, used to build the Layer 2 policy prompt. */
  orgPolicyEntries: OrgPolicyEntry[];
};

// ── Provider abstraction ──────────────────────────────────────────────────────

export type AIProvider = "openai";

export type GenerateDraftOptions = {
  context: ConversationContext;
  provider?: AIProvider;
  model?: string;
  promptVersion?: string;
};
