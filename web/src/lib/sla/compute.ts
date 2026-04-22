import type {
  OrgSlaPolicy,
  SlaComputationResult,
  SlaConversationState,
  SlaMessage,
  SlaStatus,
  SlaTarget,
} from "@/lib/sla/types";

const CLOSED_STATUSES = new Set(["resolved", "archived"]);

export const DEFAULT_SLA_POLICY: OrgSlaPolicy = {
  org_id: "",
  enabled: true,
  first_response_minutes: 60,
  next_response_minutes: 240,
  at_risk_threshold_minutes: 15,
  business_hours_json: { mode: "calendar" },
};

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function minutesUntil(iso: string, now: Date) {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 60_000);
}

function isCustomerMessage(message: SlaMessage) {
  return message.sender_type === "customer" || message.direction === "inbound";
}

function isAgentMessage(message: SlaMessage) {
  return message.sender_type === "agent" || message.direction === "outbound";
}

function statusForDueAt(dueAt: string, thresholdMinutes: number, now: Date): SlaStatus {
  const remaining = minutesUntil(dueAt, now);
  if (remaining <= 0) return "breached";
  if (remaining <= thresholdMinutes) return "at_risk";
  return "ok";
}

function closedResult(policy: OrgSlaPolicy, status: SlaStatus = "not_applicable"): SlaComputationResult {
  return {
    status,
    target: null,
    dueAt: null,
    breachedAt: null,
    firstResponseDueAt: null,
    nextResponseDueAt: null,
    firstResponseAt: null,
    lastCustomerMessageAt: null,
    lastAgentResponseAt: null,
    explain: {
      policyEnabled: policy.enabled,
      firstResponseMinutes: policy.first_response_minutes,
      nextResponseMinutes: policy.next_response_minutes,
      atRiskThresholdMinutes: policy.at_risk_threshold_minutes,
      basis: policy.enabled ? "closed" : "policy_disabled",
      minutesRemaining: null,
    },
  };
}

export function computeConversationSla({
  conversation,
  messages,
  policy,
  now = new Date(),
}: {
  conversation: SlaConversationState;
  messages: SlaMessage[];
  policy: OrgSlaPolicy;
  now?: Date;
}): SlaComputationResult {
  const normalizedPolicy = { ...DEFAULT_SLA_POLICY, ...policy };
  const previousBreachedAt = conversation.sla_breached_at;

  if (!normalizedPolicy.enabled) {
    return closedResult(normalizedPolicy);
  }

  if (conversation.status && CLOSED_STATUSES.has(conversation.status)) {
    return closedResult(normalizedPolicy, "not_applicable");
  }

  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const customerMessages = sorted.filter(isCustomerMessage);

  if (customerMessages.length === 0) {
    return {
      ...closedResult(normalizedPolicy),
      explain: {
        policyEnabled: true,
        firstResponseMinutes: normalizedPolicy.first_response_minutes,
        nextResponseMinutes: normalizedPolicy.next_response_minutes,
        atRiskThresholdMinutes: normalizedPolicy.at_risk_threshold_minutes,
        basis: "no_customer_message",
        minutesRemaining: null,
      },
    };
  }

  const firstCustomer = customerMessages[0]!;
  const firstResponse = sorted.find(
    (message) =>
      isAgentMessage(message) &&
      new Date(message.created_at).getTime() > new Date(firstCustomer.created_at).getTime()
  );
  const lastCustomer = customerMessages[customerMessages.length - 1]!;
  const lastAgentResponse = [...sorted].reverse().find(
    (message) =>
      isAgentMessage(message) &&
      new Date(message.created_at).getTime() > new Date(lastCustomer.created_at).getTime()
  );

  const firstResponseDueAt = addMinutes(firstCustomer.created_at, normalizedPolicy.first_response_minutes);

  let target: SlaTarget | null = null;
  let dueAt: string | null = null;
  let basis: SlaComputationResult["explain"]["basis"] = "waiting_on_customer";

  if (!firstResponse) {
    target = "first_response";
    dueAt = firstResponseDueAt;
    basis = "first_response_pending";
  } else if (!lastAgentResponse) {
    target = "next_response";
    dueAt = addMinutes(lastCustomer.created_at, normalizedPolicy.next_response_minutes);
    basis = "next_response_pending";
  }

  const nextResponseDueAt = target === "next_response" ? dueAt : null;
  const status = dueAt
    ? statusForDueAt(dueAt, normalizedPolicy.at_risk_threshold_minutes, now)
    : "ok";
  const breachedAt = status === "breached"
    ? previousBreachedAt ?? now.toISOString()
    : null;

  return {
    status,
    target,
    dueAt,
    breachedAt,
    firstResponseDueAt,
    nextResponseDueAt,
    firstResponseAt: firstResponse?.created_at ?? null,
    lastCustomerMessageAt: lastCustomer.created_at,
    lastAgentResponseAt: lastAgentResponse?.created_at ?? firstResponse?.created_at ?? null,
    explain: {
      policyEnabled: true,
      firstResponseMinutes: normalizedPolicy.first_response_minutes,
      nextResponseMinutes: normalizedPolicy.next_response_minutes,
      atRiskThresholdMinutes: normalizedPolicy.at_risk_threshold_minutes,
      basis,
      minutesRemaining: dueAt ? minutesUntil(dueAt, now) : null,
    },
  };
}
