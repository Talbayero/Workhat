import { emitWorkflowEvent } from "@/lib/workflow-engine";
import { computeConversationSla, DEFAULT_SLA_POLICY } from "@/lib/sla/compute";
import type { AdminDb, OrgSlaPolicy, SlaConversationState, SlaMessage } from "@/lib/sla/types";

const ACTIVE_STATUSES = ["open", "waiting_on_customer", "waiting_on_internal"];

async function loadOrgPolicy(db: AdminDb, orgId: string): Promise<OrgSlaPolicy> {
  const { data, error } = await db
    .from("org_sla_policies")
    .select("org_id, enabled, first_response_minutes, next_response_minutes, at_risk_threshold_minutes, business_hours_json")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.warn("[sla] policy lookup failed:", error.message);
  }

  return data
    ? (data as OrgSlaPolicy)
    : { ...DEFAULT_SLA_POLICY, org_id: orgId };
}

export async function refreshConversationSla({
  db,
  orgId,
  conversationId,
  now = new Date(),
  source = "sla.refresh",
}: {
  db: AdminDb;
  orgId: string;
  conversationId: string;
  now?: Date;
  source?: string;
}) {
  const [{ data: conversation, error: conversationError }, { data: messages, error: messagesError }, policy] =
    await Promise.all([
      db
        .from("conversations")
        .select("id, status, sla_status, sla_breached_at")
        .eq("id", conversationId)
        .eq("org_id", orgId)
        .maybeSingle(),
      db
        .from("messages")
        .select("id, sender_type, direction, created_at")
        .eq("conversation_id", conversationId)
        .eq("org_id", orgId)
        .eq("is_note", false)
        .order("created_at", { ascending: true })
        .limit(500),
      loadOrgPolicy(db, orgId),
    ]);

  if (conversationError) {
    console.warn("[sla] conversation lookup failed:", conversationError.message);
    return null;
  }
  if (!conversation) return null;
  if (messagesError) {
    console.warn("[sla] message lookup failed:", messagesError.message);
    return null;
  }

  const previousStatus = (conversation as SlaConversationState).sla_status;
  const result = computeConversationSla({
    conversation: conversation as SlaConversationState,
    messages: (messages ?? []) as SlaMessage[],
    policy,
    now,
  });

  const { error: updateError } = await db
    .from("conversations")
    .update({
      first_response_due_at: result.firstResponseDueAt,
      next_response_due_at: result.nextResponseDueAt,
      sla_status: result.status,
      sla_target: result.target,
      sla_due_at: result.dueAt,
      sla_breached_at: result.breachedAt,
      sla_last_evaluated_at: now.toISOString(),
      first_response_at: result.firstResponseAt,
      last_customer_message_at: result.lastCustomerMessageAt,
      last_agent_response_at: result.lastAgentResponseAt,
    })
    .eq("id", conversationId)
    .eq("org_id", orgId);

  if (updateError) {
    console.warn("[sla] conversation update failed:", updateError.message);
    return null;
  }

  if (previousStatus !== "breached" && result.status === "breached") {
    await emitWorkflowEvent({
      orgId,
      eventType: "sla.breached",
      aggregateType: "conversation",
      aggregateId: conversationId,
      conversationId,
      source,
      payload: {
        target: result.target,
        dueAt: result.dueAt,
        breachedAt: result.breachedAt,
        explain: result.explain,
      },
    });
  }

  return result;
}

export async function refreshOrgSla({
  db,
  orgId,
  limit = 200,
  now = new Date(),
}: {
  db: AdminDb;
  orgId: string;
  limit?: number;
  now?: Date;
}) {
  const { data, error } = await db
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .in("status", ACTIVE_STATUSES)
    .order("sla_due_at", { ascending: true, nullsFirst: false })
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[sla] org conversation lookup failed:", error.message);
    return { refreshed: 0, failed: 0 };
  }

  let refreshed = 0;
  let failed = 0;
  for (const row of (data ?? []) as { id: string }[]) {
    const result = await refreshConversationSla({
      db,
      orgId,
      conversationId: row.id,
      now,
      source: "api.sla.refresh",
    });
    if (result) refreshed += 1;
    else failed += 1;
  }

  return { refreshed, failed };
}
