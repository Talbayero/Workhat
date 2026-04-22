import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { executeWorkflowAction } from "@/lib/workflow-engine/actions";
import { evaluateConditions, parseConditionGroup } from "@/lib/workflow-engine/conditions";
import type {
  AdminDb,
  JsonRecord,
  WorkflowActionDefinition,
  WorkflowEventInput,
  WorkflowEventRow,
  WorkflowRuleRow,
} from "@/lib/workflow-engine/types";

const MAX_EVENT_DEPTH = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseActions(raw: unknown, max: number): WorkflowActionDefinition[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((value): value is Record<string, unknown> => isRecord(value) && typeof value.type === "string")
    .slice(0, max)
    .map((value) => ({
      type: value.type as WorkflowActionDefinition["type"],
      config: isRecord(value.config) ? JSON.parse(JSON.stringify(value.config)) as JsonRecord : {},
    }));
}

async function loadConversationContext(db: AdminDb, event: WorkflowEventRow) {
  if (!event.conversation_id) return null;

  const { data, error } = await db
    .from("conversations")
    .select("id, status, priority, assigned_user_id, assigned_to_name, risk_level, ai_confidence, tags, intent, subject, preview, last_message_at")
    .eq("id", event.conversation_id)
    .eq("org_id", event.org_id)
    .maybeSingle();

  if (error) {
    console.warn("[workflow-engine] conversation context failed:", error.message);
    return null;
  }

  return data ? data as Record<string, unknown> : null;
}

async function insertRuleExecution({
  db,
  event,
  rule,
  status,
  conditionResult,
  actionsAttempted = 0,
  actionsSucceeded = 0,
  errorMessage = null,
}: {
  db: AdminDb;
  event: WorkflowEventRow;
  rule: WorkflowRuleRow;
  status: "skipped" | "succeeded" | "failed" | "loop_prevented";
  conditionResult: JsonRecord;
  actionsAttempted?: number;
  actionsSucceeded?: number;
  errorMessage?: string | null;
}) {
  const { data, error } = await db
    .from("workflow_rule_executions")
    .insert({
      org_id: event.org_id,
      event_id: event.id,
      rule_id: rule.id,
      status,
      condition_result: conditionResult,
      actions_attempted: actionsAttempted,
      actions_succeeded: actionsSucceeded,
      error_message: errorMessage,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code !== "23505") {
      console.error("[workflow-engine] rule execution insert failed:", error.message);
    }
    return null;
  }

  return (data as { id: string }).id;
}

async function insertActionExecution({
  db,
  orgId,
  ruleExecutionId,
  actionIndex,
  actionType,
  status,
  resourceType = null,
  resourceId = null,
  output = {},
  errorMessage = null,
}: {
  db: AdminDb;
  orgId: string;
  ruleExecutionId: string;
  actionIndex: number;
  actionType: string;
  status: "skipped" | "succeeded" | "failed";
  resourceType?: string | null;
  resourceId?: string | null;
  output?: JsonRecord;
  errorMessage?: string | null;
}) {
  const { error } = await db.from("workflow_action_executions").insert({
    org_id: orgId,
    rule_execution_id: ruleExecutionId,
    action_index: actionIndex,
    action_type: actionType,
    status,
    resource_type: resourceType,
    resource_id: resourceId,
    output_json: output,
    error_message: errorMessage,
  });

  if (error) console.error("[workflow-engine] action execution insert failed:", error.message);
}

async function evaluateRule(db: AdminDb, event: WorkflowEventRow, rule: WorkflowRuleRow) {
  if (event.depth > MAX_EVENT_DEPTH) {
    await insertRuleExecution({
      db,
      event,
      rule,
      status: "loop_prevented",
      conditionResult: { matched: false, reason: "max_event_depth", depth: event.depth },
    });
    return;
  }

  const conversation = await loadConversationContext(db, event);
  const context = {
    event: {
      id: event.id,
      type: event.event_type,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      conversationId: event.conversation_id,
      actorId: event.actor_id,
      source: event.source,
      depth: event.depth,
      correlationId: event.correlation_id,
    },
    payload: event.payload_json,
    conversation,
  };

  const conditionGroup = parseConditionGroup(rule.conditions_json);
  const conditionResult = evaluateConditions(conditionGroup, context);
  if (!conditionResult.matched) {
    await insertRuleExecution({
      db,
      event,
      rule,
      status: "skipped",
      conditionResult: {
        matched: false,
        checked: conditionResult.checked,
        reason: conditionResult.reason ?? "conditions_not_matched",
      },
    });
    return;
  }

  const actions = parseActions(rule.actions_json, rule.max_actions_per_run);
  const ruleExecutionId = await insertRuleExecution({
    db,
    event,
    rule,
    status: "succeeded",
    conditionResult: { matched: true, checked: conditionResult.checked },
    actionsAttempted: actions.length,
  });

  if (!ruleExecutionId) return;

  let succeeded = 0;
  let failed = false;

  for (const [index, action] of actions.entries()) {
    try {
      const result = await executeWorkflowAction({ db, event, rule, action });
      if (result.status === "succeeded") succeeded += 1;
      await insertActionExecution({
        db,
        orgId: event.org_id,
        ruleExecutionId,
        actionIndex: index,
        actionType: action.type,
        status: result.status,
        resourceType: result.resourceType ?? null,
        resourceId: result.resourceId ?? null,
        output: result.output ?? {},
      });
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : "Action failed.";
      await insertActionExecution({
        db,
        orgId: event.org_id,
        ruleExecutionId,
        actionIndex: index,
        actionType: action.type,
        status: "failed",
        errorMessage: message.slice(0, 1000),
      });
    }
  }

  const { error } = await db
    .from("workflow_rule_executions")
    .update({
      status: failed ? "failed" : "succeeded",
      actions_succeeded: succeeded,
      error_message: failed ? "One or more actions failed." : null,
    })
    .eq("id", ruleExecutionId)
    .eq("org_id", event.org_id);

  if (error) console.error("[workflow-engine] rule execution update failed:", error.message);
}

export async function evaluateWorkflowEvent(db: AdminDb, eventId: string) {
  const { data: eventData, error: eventError } = await db
    .from("workflow_events")
    .select("id, org_id, event_type, aggregate_type, aggregate_id, conversation_id, actor_id, source, depth, correlation_id, caused_by_event_id, payload_json, created_at")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !eventData) {
    console.error("[workflow-engine] event lookup failed:", eventError?.message ?? "Event not found");
    return;
  }

  const event = eventData as WorkflowEventRow;
  const { data: rules, error: rulesError } = await db
    .from("workflow_rules")
    .select("id, org_id, name, event_type, enabled, priority, conditions_json, actions_json, max_actions_per_run")
    .eq("org_id", event.org_id)
    .eq("event_type", event.event_type)
    .eq("enabled", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(50);

  if (rulesError) {
    console.error("[workflow-engine] rule lookup failed:", rulesError.message);
    return;
  }

  for (const rule of (rules ?? []) as WorkflowRuleRow[]) {
    await evaluateRule(db, event, rule);
  }
}

export async function emitWorkflowEvent(input: WorkflowEventInput) {
  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.warn("[workflow-engine] admin client unavailable:", adminState.reason);
    return null;
  }

  const db = adminState.client;
  const safeDepth = Math.max(0, Math.min(input.depth ?? 0, 10));
  const { data, error } = await db
    .from("workflow_events")
    .insert({
      org_id: input.orgId,
      event_type: input.eventType,
      aggregate_type: input.aggregateType.slice(0, 100),
      aggregate_id: input.aggregateId ?? null,
      conversation_id: input.conversationId ?? null,
      actor_id: input.actorId ?? null,
      source: (input.source ?? "app").slice(0, 100),
      depth: safeDepth,
      correlation_id: input.correlationId ?? undefined,
      caused_by_event_id: input.causedByEventId ?? null,
      payload_json: input.payload ?? {},
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[workflow-engine] event insert failed:", error?.message ?? "No event returned");
    return null;
  }

  const eventId = (data as { id: string }).id;
  await evaluateWorkflowEvent(db, eventId);
  return eventId;
}
