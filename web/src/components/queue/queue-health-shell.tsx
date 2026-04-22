import Link from "next/link";
import type { ReactNode } from "react";
import type { InboxConversation, RiskLevel, SlaStatus } from "@/lib/mock-data";
import type { QueueFilters, QueueHealth } from "@/lib/supabase/queries";

const SLA_LABEL: Record<SlaStatus, string> = {
  not_applicable: "No SLA",
  ok: "On track",
  at_risk: "At risk",
  breached: "Breached",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Waiting on customer",
  waiting_on_internal: "Waiting on internal",
  resolved: "Resolved",
  archived: "Archived",
};

function formatDueAt(value: string | null | undefined) {
  if (!value) return "No active deadline";
  const due = new Date(value);
  const diffMinutes = Math.round((due.getTime() - Date.now()) / 60_000);
  if (diffMinutes <= 0) return `${Math.abs(diffMinutes)}m overdue`;
  if (diffMinutes < 60) return `${diffMinutes}m left`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes ? `${hours}h ${minutes}m left` : `${hours}h left`;
}

function slaBadgeClass(status: SlaStatus) {
  if (status === "breached") return "border-red-300 bg-red-50 text-red-700";
  if (status === "at_risk") return "border-amber-300 bg-amber-50 text-amber-800";
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]";
}

function riskBadgeClass(risk: RiskLevel) {
  if (risk === "red") return "bg-red-50 text-red-700";
  if (risk === "yellow") return "bg-amber-50 text-amber-800";
  return "bg-emerald-50 text-emerald-700";
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-4">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function SelectField({
  label,
  name,
  value,
  children,
}: {
  label: string;
  name: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs font-medium text-[var(--muted)]">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--moss)]"
      >
        {children}
      </select>
    </label>
  );
}

export function QueueHealthShell({
  health,
  conversations,
  filters,
}: {
  health: QueueHealth;
  conversations: InboxConversation[];
  filters: QueueFilters;
}) {
  const maxBucket = Math.max(...health.agingBuckets.map((bucket) => bucket.count), 1);

  return (
    <main className="h-full overflow-y-auto bg-[var(--background)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-[10px] text-[var(--muted)]">Operations</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Queue health</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              SLA pressure, aging, and active work across the support queue.
            </p>
          </div>
          <Link
            href="/inbox?view=sla-breached"
            className="rounded-lg border border-[var(--line-strong)] px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--moss)]"
          >
            Open breached inbox view
          </Link>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Active queue" value={health.active} detail="Open operational conversations" />
          <MetricCard label="SLA at risk" value={health.atRisk} detail="Within configured warning window" />
          <MetricCard label="SLA breached" value={health.breached} detail="Past first or next response target" />
          <MetricCard label="Unassigned" value={health.unassigned} detail="Needs ownership" />
          <MetricCard label="Backlog pressure" value={`${health.backlogPressure}%`} detail="Weighted SLA, risk, and ownership load" />
        </section>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Aging buckets</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">Based on each conversation&apos;s last message time.</p>
            </div>
            <p className="text-xs text-[var(--muted)]">{health.highRisk} risk-weighted conversations</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {health.agingBuckets.map((bucket) => (
              <div key={bucket.id} className="rounded-lg border border-[var(--line)] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{bucket.label}</span>
                  <span className="text-[var(--muted)]">{bucket.count}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-[var(--sage)]">
                  <div
                    className="h-2 rounded-full bg-[var(--moss)]"
                    style={{ width: `${Math.max(6, (bucket.count / maxBucket) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-4">
          <form action="/queue" className="flex flex-wrap items-end gap-3">
            <SelectField label="SLA" name="sla" value={filters.sla ?? "all"}>
              <option value="all">All SLA states</option>
              <option value="at_risk">At risk</option>
              <option value="breached">Breached</option>
              <option value="ok">On track</option>
            </SelectField>
            <SelectField label="Risk" name="risk" value={filters.risk ?? "all"}>
              <option value="all">All risk levels</option>
              <option value="red">Red</option>
              <option value="yellow">Yellow</option>
              <option value="green">Green</option>
            </SelectField>
            <SelectField label="Assignee" name="assignee" value={filters.assignee ?? "all"}>
              <option value="all">All assignees</option>
              <option value="unassigned">Unassigned</option>
              {health.assignees.map((assignee) => (
                <option key={assignee} value={assignee}>{assignee}</option>
              ))}
            </SelectField>
            <SelectField label="Status" name="status" value={filters.status ?? "all"}>
              <option value="all">All active statuses</option>
              {health.statuses.map((status) => (
                <option key={status} value={status}>{STATUS_LABEL[status] ?? status}</option>
              ))}
            </SelectField>
            <SelectField label="Channel" name="channel" value={filters.channel ?? "all"}>
              <option value="all">All channels</option>
              {health.channels.map((channel) => (
                <option key={channel} value={channel}>{channel}</option>
              ))}
            </SelectField>
            <SelectField label="Intent" name="intent" value={filters.intent ?? "all"}>
              <option value="all">All intents</option>
              {health.intents.map((intent) => (
                <option key={intent} value={intent}>{intent}</option>
              ))}
            </SelectField>
            <button className="rounded-lg bg-[var(--moss)] px-4 py-2 text-sm font-medium text-white">
              Apply
            </button>
            <Link href="/queue" className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium">
              Reset
            </Link>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-strong)]">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold">Filtered queue</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{conversations.length} conversations shown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Conversation</th>
                  <th className="px-4 py-3 font-medium">SLA</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Assignee</th>
                  <th className="px-4 py-3 font-medium">Intent</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {conversations.map((conversation) => {
                  const slaStatus = conversation.sla?.status ?? "not_applicable";
                  return (
                    <tr key={conversation.id} className="hover:bg-[var(--sage)]/50">
                      <td className="max-w-[360px] px-4 py-3">
                        <Link href={`/inbox?conversation=${conversation.id}`} className="font-medium hover:underline">
                          {conversation.subject}
                        </Link>
                        <p className="mt-1 truncate text-xs text-[var(--muted)]">
                          {conversation.customerName} {conversation.companyName ? `- ${conversation.companyName}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${slaBadgeClass(slaStatus)}`}>
                          {SLA_LABEL[slaStatus]}
                        </span>
                        <p className="mt-1 text-xs text-[var(--muted)]">{formatDueAt(conversation.sla?.dueAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${riskBadgeClass(conversation.riskLevel)}`}>
                          {conversation.riskLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--muted)]">{STATUS_LABEL[conversation.status] ?? conversation.status}</td>
                      <td className="px-4 py-3 text-xs">{conversation.assignee || "Unassigned"}</td>
                      <td className="px-4 py-3 text-xs">{conversation.intent || "unclassified"}</td>
                      <td className="px-4 py-3 text-xs text-[var(--muted)]">{conversation.lastSeen}</td>
                    </tr>
                  );
                })}
                {conversations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                      No conversations match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
