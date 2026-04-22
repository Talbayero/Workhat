import type { createOptionalAdminClient } from "@/lib/supabase/admin";

export type AdminDb = NonNullable<ReturnType<typeof createOptionalAdminClient>["client"]>;

export const WORKFLOW_EVENT_TYPES = [
  "conversation.created",
  "message.received",
  "draft.generated",
  "reply.sent",
  "conversation.updated",
  "risk.changed",
  "sla.breached",
] as const;

export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];

export const WORKFLOW_ACTION_TYPES = [
  "assign_conversation",
  "apply_tag",
  "change_priority",
  "change_risk",
  "create_qa_follow_up",
  "notify_manager",
  "flag_knowledge_gap_candidate",
] as const;

export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = Record<string, JsonValue>;

export type WorkflowEventInput = {
  orgId: string;
  eventType: WorkflowEventType;
  aggregateType: string;
  aggregateId?: string | null;
  conversationId?: string | null;
  actorId?: string | null;
  source?: string;
  depth?: number;
  correlationId?: string | null;
  causedByEventId?: string | null;
  payload?: JsonRecord;
};

export type WorkflowEventRow = {
  id: string;
  org_id: string;
  event_type: WorkflowEventType;
  aggregate_type: string;
  aggregate_id: string | null;
  conversation_id: string | null;
  actor_id: string | null;
  source: string;
  depth: number;
  correlation_id: string;
  caused_by_event_id: string | null;
  payload_json: JsonRecord;
  created_at: string;
};

export type WorkflowRuleRow = {
  id: string;
  org_id: string;
  name: string;
  event_type: WorkflowEventType;
  enabled: boolean;
  priority: number;
  conditions_json: unknown;
  actions_json: unknown;
  max_actions_per_run: number;
};

export type WorkflowConditionOperator =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "contains"
  | "exists"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export type WorkflowCondition = {
  path: string;
  op: WorkflowConditionOperator;
  value?: JsonPrimitive | JsonPrimitive[];
};

export type WorkflowConditionGroup = {
  all?: WorkflowCondition[];
  any?: WorkflowCondition[];
  none?: WorkflowCondition[];
};

export type WorkflowActionDefinition = {
  type: WorkflowActionType;
  config?: JsonRecord;
};

export type WorkflowEvaluationContext = {
  event: Record<string, unknown>;
  payload: Record<string, unknown>;
  conversation: Record<string, unknown> | null;
};

export type ActionResult = {
  status: "succeeded" | "skipped";
  resourceType?: string | null;
  resourceId?: string | null;
  output?: JsonRecord;
};
