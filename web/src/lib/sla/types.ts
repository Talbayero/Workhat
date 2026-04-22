import type { createOptionalAdminClient } from "@/lib/supabase/admin";

export type AdminDb = NonNullable<ReturnType<typeof createOptionalAdminClient>["client"]>;

export type SlaStatus = "not_applicable" | "ok" | "at_risk" | "breached";
export type SlaTarget = "first_response" | "next_response";

export type OrgSlaPolicy = {
  org_id: string;
  enabled: boolean;
  first_response_minutes: number;
  next_response_minutes: number;
  at_risk_threshold_minutes: number;
  business_hours_json?: Record<string, unknown>;
};

export type SlaMessage = {
  id: string;
  sender_type: string | null;
  direction: string | null;
  created_at: string;
};

export type SlaConversationState = {
  id: string;
  status: string | null;
  sla_status: SlaStatus | null;
  sla_breached_at: string | null;
};

export type SlaComputationResult = {
  status: SlaStatus;
  target: SlaTarget | null;
  dueAt: string | null;
  breachedAt: string | null;
  firstResponseDueAt: string | null;
  nextResponseDueAt: string | null;
  firstResponseAt: string | null;
  lastCustomerMessageAt: string | null;
  lastAgentResponseAt: string | null;
  explain: {
    policyEnabled: boolean;
    firstResponseMinutes: number;
    nextResponseMinutes: number;
    atRiskThresholdMinutes: number;
    basis: "no_customer_message" | "first_response_pending" | "next_response_pending" | "waiting_on_customer" | "closed" | "policy_disabled";
    minutesRemaining: number | null;
  };
};
