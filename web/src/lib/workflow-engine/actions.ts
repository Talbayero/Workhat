import type {
  ActionResult,
  AdminDb,
  JsonRecord,
  WorkflowActionDefinition,
  WorkflowEventRow,
  WorkflowRuleRow,
} from "@/lib/workflow-engine/types";
import { notifyConversationAssignmentChanged, notifyQaFollowUpAssigned } from "@/lib/notifications/conversation-notifications";

const VALID_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const VALID_RISK_LEVELS = new Set(["green", "yellow", "red"]);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringConfig(config: JsonRecord | undefined, key: string, maxLength: number) {
  const value = config?.[key];
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function jsonRecord(value: Record<string, unknown>): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

async function fetchConversation(db: AdminDb, orgId: string, conversationId: string) {
  const { data, error } = await db
    .from("conversations")
    .select("id, org_id, assigned_user_id, assigned_to_name, priority, risk_level, tags")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? asRecord(data) : null;
}

function tagsFromRow(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === "string");
}

async function assignConversation(
  db: AdminDb,
  event: WorkflowEventRow,
  action: WorkflowActionDefinition
): Promise<ActionResult> {
  if (!event.conversation_id) return { status: "skipped", output: { reason: "missing_conversation_id" } };

  const assignedUserId = stringConfig(action.config, "assignedUserId", 36);
  let assignedToName = stringConfig(action.config, "assignedToName", 100);

  if (assignedUserId) {
    const { data: user, error } = await db
      .from("users")
      .select("id, full_name")
      .eq("id", assignedUserId)
      .eq("org_id", event.org_id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!user) return { status: "skipped", output: { reason: "target_user_not_found" } };
    assignedToName = (user as { full_name?: string | null }).full_name ?? assignedToName;
  }

  if (!assignedUserId && !assignedToName) {
    return { status: "skipped", output: { reason: "missing_assignment_target" } };
  }

  const existing = await fetchConversation(db, event.org_id, event.conversation_id);
  if (!existing) return { status: "skipped", output: { reason: "conversation_not_found" } };
  if (
    String(existing.assigned_user_id ?? "") === (assignedUserId || "") &&
    String(existing.assigned_to_name ?? "").trim() === assignedToName
  ) {
    return {
      status: "skipped",
      resourceType: "conversation",
      resourceId: event.conversation_id,
      output: { reason: "assignment_unchanged", assignedUserId: assignedUserId || null, assignedToName },
    };
  }

  const { error } = await db
    .from("conversations")
    .update({
      assigned_user_id: assignedUserId || null,
      assigned_to_name: assignedToName,
    })
    .eq("id", event.conversation_id)
    .eq("org_id", event.org_id);

  if (error) throw new Error(error.message);

  await notifyConversationAssignmentChanged({
    db,
    orgId: event.org_id,
    conversationId: event.conversation_id,
    previousAssignedUserId: typeof existing.assigned_user_id === "string" ? existing.assigned_user_id : null,
    previousAssignedToName: typeof existing.assigned_to_name === "string" ? existing.assigned_to_name : null,
    nextAssignedUserId: assignedUserId || null,
    nextAssignedToName: assignedToName,
    assignedByUserId: event.actor_id,
    requestOrigin: null,
  });

  return {
    status: "succeeded",
    resourceType: "conversation",
    resourceId: event.conversation_id,
    output: { assignedUserId: assignedUserId || null, assignedToName },
  };
}

async function applyTag(
  db: AdminDb,
  event: WorkflowEventRow,
  action: WorkflowActionDefinition
): Promise<ActionResult> {
  if (!event.conversation_id) return { status: "skipped", output: { reason: "missing_conversation_id" } };

  const tag = stringConfig(action.config, "tag", 50);
  if (!tag) return { status: "skipped", output: { reason: "missing_tag" } };

  const conversation = await fetchConversation(db, event.org_id, event.conversation_id);
  if (!conversation) return { status: "skipped", output: { reason: "conversation_not_found" } };

  const tags = tagsFromRow(conversation.tags);
  if (tags.includes(tag)) {
    return { status: "skipped", resourceType: "conversation", resourceId: event.conversation_id, output: { reason: "tag_already_present", tag } };
  }

  const nextTags = [...tags, tag].slice(0, 20);
  const { error } = await db
    .from("conversations")
    .update({ tags: nextTags })
    .eq("id", event.conversation_id)
    .eq("org_id", event.org_id);

  if (error) throw new Error(error.message);

  return {
    status: "succeeded",
    resourceType: "conversation",
    resourceId: event.conversation_id,
    output: { tag, tags: nextTags },
  };
}

async function changePriority(
  db: AdminDb,
  event: WorkflowEventRow,
  action: WorkflowActionDefinition
): Promise<ActionResult> {
  if (!event.conversation_id) return { status: "skipped", output: { reason: "missing_conversation_id" } };
  const priority = stringConfig(action.config, "priority", 20);
  if (!VALID_PRIORITIES.has(priority)) return { status: "skipped", output: { reason: "invalid_priority" } };

  const conversation = await fetchConversation(db, event.org_id, event.conversation_id);
  if (!conversation) return { status: "skipped", output: { reason: "conversation_not_found" } };
  if (conversation.priority === priority) {
    return { status: "skipped", resourceType: "conversation", resourceId: event.conversation_id, output: { reason: "priority_unchanged", priority } };
  }

  const { error } = await db
    .from("conversations")
    .update({ priority })
    .eq("id", event.conversation_id)
    .eq("org_id", event.org_id);

  if (error) throw new Error(error.message);
  return { status: "succeeded", resourceType: "conversation", resourceId: event.conversation_id, output: { priority } };
}

async function changeRisk(
  db: AdminDb,
  event: WorkflowEventRow,
  action: WorkflowActionDefinition
): Promise<ActionResult> {
  if (!event.conversation_id) return { status: "skipped", output: { reason: "missing_conversation_id" } };
  const riskLevel = stringConfig(action.config, "riskLevel", 20);
  if (!VALID_RISK_LEVELS.has(riskLevel)) return { status: "skipped", output: { reason: "invalid_risk_level" } };

  const conversation = await fetchConversation(db, event.org_id, event.conversation_id);
  if (!conversation) return { status: "skipped", output: { reason: "conversation_not_found" } };
  if (conversation.risk_level === riskLevel) {
    return { status: "skipped", resourceType: "conversation", resourceId: event.conversation_id, output: { reason: "risk_unchanged", riskLevel } };
  }

  const { error } = await db
    .from("conversations")
    .update({ risk_level: riskLevel })
    .eq("id", event.conversation_id)
    .eq("org_id", event.org_id);

  if (error) throw new Error(error.message);
  return {
    status: "succeeded",
    resourceType: "conversation",
    resourceId: event.conversation_id,
    output: { previousRiskLevel: String(conversation.risk_level ?? ""), riskLevel },
  };
}

async function createQaFollowUp(
  db: AdminDb,
  event: WorkflowEventRow,
  rule: WorkflowRuleRow,
  action: WorkflowActionDefinition
): Promise<ActionResult> {
  if (!event.conversation_id) return { status: "skipped", output: { reason: "missing_conversation_id" } };

  const reason = stringConfig(action.config, "reason", 1000) || `Workflow rule requested QA follow-up: ${rule.name}`;
  const severity = stringConfig(action.config, "severity", 20) || "medium";
  const assignedToUserId = stringConfig(action.config, "assignedToUserId", 36) || null;

  const { data, error } = await db
    .from("qa_follow_ups")
    .insert({
      org_id: event.org_id,
      conversation_id: event.conversation_id,
      assigned_to_user_id: assignedToUserId,
      source_event_id: event.id,
      source_rule_id: rule.id,
      severity: ["low", "medium", "high", "urgent"].includes(severity) ? severity : "medium",
      reason,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create QA follow-up.");

  if (assignedToUserId) {
    await notifyQaFollowUpAssigned({
      db,
      orgId: event.org_id,
      conversationId: event.conversation_id,
      reviewerUserId: assignedToUserId,
      assignedByUserId: event.actor_id,
      requestOrigin: null,
    });
  }

  return { status: "succeeded", resourceType: "qa_follow_up", resourceId: data.id, output: { severity, reason } };
}

async function notifyManager(
  db: AdminDb,
  event: WorkflowEventRow,
  rule: WorkflowRuleRow,
  action: WorkflowActionDefinition
): Promise<ActionResult> {
  const title = stringConfig(action.config, "title", 200) || `Workflow alert: ${rule.name}`;
  const body = stringConfig(action.config, "body", 2000) || "A workflow rule matched an operational event.";
  const recipientUserId = stringConfig(action.config, "recipientUserId", 36) || null;

  const { data, error } = await db
    .from("workflow_notifications")
    .insert({
      org_id: event.org_id,
      conversation_id: event.conversation_id,
      recipient_user_id: recipientUserId,
      recipient_role: recipientUserId ? null : "manager",
      source_event_id: event.id,
      source_rule_id: rule.id,
      title,
      body,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to queue workflow notification.");
  return { status: "succeeded", resourceType: "workflow_notification", resourceId: data.id, output: { title } };
}

async function flagKnowledgeGapCandidate(
  db: AdminDb,
  event: WorkflowEventRow,
  rule: WorkflowRuleRow,
  action: WorkflowActionDefinition
): Promise<ActionResult> {
  const title = stringConfig(action.config, "title", 300) || `Knowledge gap from ${event.event_type}`;
  const reason = stringConfig(action.config, "reason", 2000) || `Workflow rule matched: ${rule.name}`;
  const evidence = asRecord(action.config?.evidence);

  const { data, error } = await db
    .from("knowledge_gap_candidates")
    .insert({
      org_id: event.org_id,
      conversation_id: event.conversation_id,
      source_event_id: event.id,
      source_rule_id: rule.id,
      title,
      reason,
      evidence_json: jsonRecord({
        ...evidence,
        eventType: event.event_type,
        eventPayload: event.payload_json,
      }),
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create knowledge gap candidate.");
  return { status: "succeeded", resourceType: "knowledge_gap_candidate", resourceId: data.id, output: { title } };
}

export async function executeWorkflowAction({
  db,
  event,
  rule,
  action,
}: {
  db: AdminDb;
  event: WorkflowEventRow;
  rule: WorkflowRuleRow;
  action: WorkflowActionDefinition;
}): Promise<ActionResult> {
  switch (action.type) {
    case "assign_conversation":
      return assignConversation(db, event, action);
    case "apply_tag":
      return applyTag(db, event, action);
    case "change_priority":
      return changePriority(db, event, action);
    case "change_risk":
      return changeRisk(db, event, action);
    case "create_qa_follow_up":
      return createQaFollowUp(db, event, rule, action);
    case "notify_manager":
      return notifyManager(db, event, rule, action);
    case "flag_knowledge_gap_candidate":
      return flagKnowledgeGapCandidate(db, event, rule, action);
    default:
      return { status: "skipped", output: { reason: "unknown_action_type" } };
  }
}
