import type { Metadata } from "next";
import { QueueHealthShell } from "@/components/queue/queue-health-shell";
import { getQueueHealth, type QueueFilters } from "@/lib/supabase/queries";
import type { RiskLevel } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Queue health - Work Hat" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SLA_FILTERS = new Set(["all", "at_risk", "breached", "ok"]);
const RISK_FILTERS = new Set(["all", "green", "yellow", "red"]);
const STATUS_FILTERS = new Set(["all", "open", "in_progress", "waiting_on_customer", "waiting_on_internal"]);
const CHANNEL_FILTERS = new Set(["all", "email"]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(searchParams: Record<string, string | string[] | undefined>): QueueFilters {
  const sla = first(searchParams.sla);
  const risk = first(searchParams.risk);
  const status = first(searchParams.status);
  const channel = first(searchParams.channel);
  const assignee = first(searchParams.assignee);
  const intent = first(searchParams.intent);

  return {
    sla: sla && SLA_FILTERS.has(sla) ? sla as QueueFilters["sla"] : "all",
    risk: risk && RISK_FILTERS.has(risk) ? risk as RiskLevel | "all" : "all",
    status: status && STATUS_FILTERS.has(status) ? status as QueueFilters["status"] : "all",
    channel: channel && CHANNEL_FILTERS.has(channel) ? channel as QueueFilters["channel"] : "all",
    assignee: assignee?.trim() || "all",
    intent: intent?.trim() || "all",
  };
}

export default async function QueuePage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const { health, conversations } = await getQueueHealth(filters);

  return (
    <QueueHealthShell
      health={health}
      conversations={conversations}
      filters={filters}
    />
  );
}
