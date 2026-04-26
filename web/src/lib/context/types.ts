export const CONTEXT_OBJECT_STATUSES = ["draft", "active", "archived"] as const;
export type ContextObjectStatus = (typeof CONTEXT_OBJECT_STATUSES)[number];

export const CONTEXT_DEFINITION_KEYS = [
  "when_to_use",
  "required_info",
  "decision_rules",
  "allowed_actions",
  "prohibited_actions",
  "escalation_rules",
  "risk_flags",
  "output_guidelines",
  "tone_guidelines",
  "known_gaps",
  "success_metrics",
  "knowledge_entry_ids",
] as const;

export type ContextDefinition = {
  when_to_use: string;
  required_info: string[];
  decision_rules: string[];
  allowed_actions: string[];
  prohibited_actions: string[];
  escalation_rules: string[];
  risk_flags: string[];
  output_guidelines: string[];
  tone_guidelines: string[];
  known_gaps: string[];
  success_metrics: string[];
  knowledge_entry_ids: string[];
};

export type ContextVersionRecord = {
  id: string;
  org_id: string;
  context_object_id: string;
  version_number: number;
  title: string;
  description: string;
  context_definition_json: ContextDefinition;
  created_by_user_id: string | null;
  created_at: string;
};

export type ContextObjectRecord = {
  id: string;
  org_id: string;
  company_id: string | null;
  title: string;
  description: string;
  category: string;
  status: ContextObjectStatus;
  owner_user_id: string | null;
  reviewer_user_id: string | null;
  current_version_id: string | null;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type ContextCompanySummary = {
  id: string;
  name: string;
};

export type ContextKnowledgeSummary = {
  id: string;
  title: string;
  summary: string;
  category: string;
};

export type ContextObjectSummary = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: ContextObjectStatus;
  companyId: string | null;
  companyName: string | null;
  ownerUserId: string | null;
  reviewerUserId: string | null;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  activeVersionId: string | null;
  activeVersionNumber: number | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type ContextObjectDetail = ContextObjectSummary & {
  currentVersion: ContextVersionRecord | null;
  activeVersion: ContextVersionRecord | null;
  versions: ContextVersionRecord[];
  linkedKnowledgeEntries: ContextKnowledgeSummary[];
};

export type ContextDraftSelection = {
  id: string;
  versionId: string;
  title: string;
  description: string;
  category: string;
  companyName: string | null;
  versionNumber: number;
  contextDefinition: ContextDefinition;
  linkedKnowledgeEntries: ContextKnowledgeSummary[];
};

export type ContextFormInput = {
  title: string;
  description: string;
  category: string;
  companyId: string | null;
  ownerUserId: string | null;
  reviewerUserId: string | null;
  contextDefinition: ContextDefinition;
};

export type ContextListStatusFilter = ContextObjectStatus | "all";

const MAX_TEXT_LENGTH = 5_000;
const MAX_LIST_ITEMS = 50;
const MAX_LIST_ITEM_LENGTH = 500;

function normalizeString(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => item.slice(0, MAX_LIST_ITEM_LENGTH));

  return [...new Set(normalized)];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuidList(value: unknown) {
  return normalizeStringList(value).filter((item) => UUID_RE.test(item));
}

export function emptyContextDefinition(): ContextDefinition {
  return {
    when_to_use: "",
    required_info: [],
    decision_rules: [],
    allowed_actions: [],
    prohibited_actions: [],
    escalation_rules: [],
    risk_flags: [],
    output_guidelines: [],
    tone_guidelines: [],
    known_gaps: [],
    success_metrics: [],
    knowledge_entry_ids: [],
  };
}

export function normalizeContextDefinition(value: unknown): ContextDefinition {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    when_to_use: normalizeString(raw.when_to_use),
    required_info: normalizeStringList(raw.required_info),
    decision_rules: normalizeStringList(raw.decision_rules),
    allowed_actions: normalizeStringList(raw.allowed_actions),
    prohibited_actions: normalizeStringList(raw.prohibited_actions),
    escalation_rules: normalizeStringList(raw.escalation_rules),
    risk_flags: normalizeStringList(raw.risk_flags),
    output_guidelines: normalizeStringList(raw.output_guidelines),
    tone_guidelines: normalizeStringList(raw.tone_guidelines),
    known_gaps: normalizeStringList(raw.known_gaps),
    success_metrics: normalizeStringList(raw.success_metrics),
    knowledge_entry_ids: normalizeUuidList(raw.knowledge_entry_ids),
  };
}
