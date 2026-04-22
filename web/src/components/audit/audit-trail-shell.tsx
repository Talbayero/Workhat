import Link from "next/link";
import type { AuditTrailLog, AuditTrailResult } from "@/lib/audit/audit-trail";

type AuditTrailShellProps = {
  result: AuditTrailResult;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatAction(action: string) {
  return action
    .split(".")
    .map((part) => part.replace(/_/g, " "))
    .join(" / ");
}

function actionTone(log: AuditTrailLog) {
  if (!log.success) return "border-[rgba(201,96,106,0.45)] bg-[rgba(73,17,28,0.26)] text-[#f0a3a9]";
  if (log.action.startsWith("security.") || log.action.startsWith("auth.")) {
    return "border-[rgba(169,146,125,0.35)] bg-[rgba(169,146,125,0.12)] text-[var(--amber)]";
  }
  if (log.action.startsWith("billing.") || log.action.includes("deleted") || log.action.includes("role_changed")) {
    return "border-[rgba(144,50,61,0.36)] bg-[rgba(144,50,61,0.14)] text-[#d98a93]";
  }
  return "border-[var(--line)] bg-[rgba(255,255,255,0.03)] text-[var(--foreground)]";
}

function actionDot(log: AuditTrailLog) {
  if (!log.success) return "bg-[#c9606a]";
  if (log.action.startsWith("security.") || log.action.startsWith("auth.")) return "bg-[var(--amber)]";
  if (log.action.includes("deleted") || log.action.includes("role_changed")) return "bg-[var(--moss)]";
  return "bg-[#78a17a]";
}

function summarize(log: AuditTrailLog) {
  const actor = log.actor_email ?? "System";
  const resource = log.resource_label ?? log.resource_type ?? "record";
  return `${actor} performed ${log.action} on ${resource}`;
}

function compactJson(value: AuditTrailLog["old_values"]) {
  if (!value) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function valueOrDash(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function buildHref(result: AuditTrailResult, page: number) {
  const params = new URLSearchParams();
  const filters = result.filters;
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.entityId) params.set("entityId", filters.entityId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.orgId) params.set("orgId", filters.orgId);
  if (filters.pageSize !== 25) params.set("pageSize", String(filters.pageSize));
  params.set("page", String(page));
  return `/audit?${params.toString()}`;
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--line)] bg-[rgba(255,255,255,0.025)] px-4 py-3">
      <p className="eyebrow text-[9px] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
    </div>
  );
}

function Filters({ result }: { result: AuditTrailResult }) {
  const { filters, facets } = result;

  return (
    <form action="/audit" className="rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
      <input type="hidden" name="orgId" value={result.orgScope.id} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="audit-actor" className="eyebrow text-[9px] text-[var(--muted)]">Actor</label>
          <input
            id="audit-actor"
            name="actor"
            defaultValue={filters.actor ?? ""}
            list="audit-actors"
            placeholder="Email or actor id"
            className="mt-1.5 w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)]"
          />
          <datalist id="audit-actors">
            {facets.actors.map((actor) => (
              <option key={actor.value} value={actor.value}>{actor.label}</option>
            ))}
          </datalist>
        </div>

        <div className="min-w-[220px] flex-1">
          <label htmlFor="audit-action" className="eyebrow text-[9px] text-[var(--muted)]">Action</label>
          <select
            id="audit-action"
            name="action"
            defaultValue={filters.action ?? ""}
            className="mt-1.5 w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)]"
          >
            <option value="">All actions</option>
            {facets.actions.map((action) => (
              <option key={action.value} value={action.value}>{action.label}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[180px]">
          <label htmlFor="audit-entity-type" className="eyebrow text-[9px] text-[var(--muted)]">Entity type</label>
          <input
            id="audit-entity-type"
            name="entityType"
            defaultValue={filters.entityType ?? ""}
            list="audit-entity-types"
            placeholder="contact, company..."
            className="mt-1.5 w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)]"
          />
          <datalist id="audit-entity-types">
            {facets.entityTypes.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </datalist>
        </div>

        <div className="min-w-[230px] flex-1">
          <label htmlFor="audit-entity-id" className="eyebrow text-[9px] text-[var(--muted)]">Entity id</label>
          <input
            id="audit-entity-id"
            name="entityId"
            defaultValue={filters.entityId ?? ""}
            placeholder="UUID"
            className="mt-1.5 w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)]"
          />
        </div>

        <div>
          <label htmlFor="audit-from" className="eyebrow text-[9px] text-[var(--muted)]">From</label>
          <input
            id="audit-from"
            name="from"
            type="date"
            defaultValue={filters.from ?? ""}
            className="mt-1.5 w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)]"
          />
        </div>

        <div>
          <label htmlFor="audit-to" className="eyebrow text-[9px] text-[var(--muted)]">To</label>
          <input
            id="audit-to"
            name="to"
            type="date"
            defaultValue={filters.to ?? ""}
            className="mt-1.5 w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)]"
          />
        </div>

        <div className="min-w-[160px]">
          <label htmlFor="audit-page-size" className="eyebrow text-[9px] text-[var(--muted)]">Page size</label>
          <select
            id="audit-page-size"
            name="pageSize"
            defaultValue={String(filters.pageSize)}
            className="mt-1.5 w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)]"
          >
            {[25, 50, 100].map((size) => (
              <option key={size} value={size}>{size} rows</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Link href="/audit" className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--moss)] hover:text-[var(--foreground)]">
            Reset
          </Link>
          <button className="rounded-full bg-[var(--moss)] px-5 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--moss-strong)]">
            Apply filters
          </button>
        </div>
      </div>
    </form>
  );
}

function EventDetails({ log }: { log: AuditTrailLog }) {
  const before = compactJson(log.old_values);
  const after = compactJson(log.new_values);

  return (
    <details className="group mt-4 rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)]">
      <summary className="cursor-pointer list-none px-4 py-3 text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">
        <span className="font-medium text-[var(--foreground)]">Inspect event details</span>
        <span className="ml-2 text-[10px] group-open:hidden">show</span>
        <span className="ml-2 hidden text-[10px] group-open:inline">hide</span>
      </summary>
      <div className="border-t border-[var(--line)] px-4 py-4">
        <div className="grid gap-3 text-xs md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-[var(--muted)]">Actor role</p>
            <p className="mt-1 font-mono">{valueOrDash(log.actor_role)}</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">IP address</p>
            <p className="mt-1 font-mono">{valueOrDash(log.ip_address)}</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Resource id</p>
            <p className="mt-1 truncate font-mono">{valueOrDash(log.resource_id)}</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Event id</p>
            <p className="mt-1 truncate font-mono">{log.id}</p>
          </div>
        </div>

        {log.user_agent && (
          <div className="mt-4">
            <p className="text-xs text-[var(--muted)]">User agent</p>
            <p className="mt-1 break-words font-mono text-[11px] leading-5 text-[var(--muted)]">{log.user_agent}</p>
          </div>
        )}

        {log.error_message && (
          <div className="mt-4 rounded-[14px] border border-[rgba(201,96,106,0.38)] bg-[rgba(73,17,28,0.22)] px-4 py-3 text-sm text-[#f0a3a9]">
            {log.error_message}
          </div>
        )}

        {(before || after) && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div>
              <p className="eyebrow text-[9px] text-[var(--muted)]">Before</p>
              <pre className="scroll-soft mt-2 max-h-64 overflow-auto rounded-[14px] border border-[var(--line)] bg-black/20 p-3 text-[11px] leading-5 text-[var(--muted)]">{before || "{}"}</pre>
            </div>
            <div>
              <p className="eyebrow text-[9px] text-[var(--muted)]">After</p>
              <pre className="scroll-soft mt-2 max-h-64 overflow-auto rounded-[14px] border border-[var(--line)] bg-black/20 p-3 text-[11px] leading-5 text-[var(--muted)]">{after || "{}"}</pre>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-[24px] border border-dashed border-[var(--line-strong)] bg-[rgba(255,255,255,0.015)] px-8 text-center">
      <div className="max-w-lg">
        <p className="eyebrow text-[10px] text-[var(--muted)]">No matching events</p>
        <h2 className="mt-3 text-2xl font-semibold">The audit trail is quiet for this filter set.</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Try widening the date range, clearing the actor filter, or searching by a specific resource id when investigating a record.
        </p>
        <Link href="/audit" className="mt-5 inline-flex rounded-full bg-[var(--moss)] px-5 py-2.5 text-sm font-medium text-white">
          Clear filters
        </Link>
      </div>
    </div>
  );
}

function AuditEvent({ log }: { log: AuditTrailLog }) {
  return (
    <article className="rounded-[22px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${actionDot(log)}`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${actionTone(log)}`}>
                {formatAction(log.action)}
              </span>
              <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] text-[var(--muted)]">
                {log.success ? "Success" : "Failed"}
              </span>
              {log.resource_type && (
                <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] text-[var(--muted)]">
                  {log.resource_type}
                </span>
              )}
            </div>
            <h2 className="mt-3 text-base font-semibold leading-6">{summarize(log)}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
              <span>{formatDate(log.created_at)}</span>
              <span>Actor: {valueOrDash(log.actor_email)}</span>
              <span>Resource: {valueOrDash(log.resource_label ?? log.resource_id)}</span>
            </div>
          </div>
        </div>
        <div className="rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-3 py-2 text-xs text-[var(--muted)] lg:min-w-[220px]">
          <p className="eyebrow text-[9px]">Operational note</p>
          <p className="mt-1 leading-5">
            {log.action.startsWith("security.")
              ? "Security event. Review source and nearby failures."
              : log.action.includes("deleted")
                ? "Deletion event. Confirm expected lifecycle."
                : log.action.startsWith("billing.")
                  ? "Billing event. Verify plan state if customer-facing."
                  : "Routine operational event."}
          </p>
        </div>
      </div>
      <EventDetails log={log} />
    </article>
  );
}

function Pagination({ result }: { result: AuditTrailResult }) {
  const start = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const end = Math.min(result.total, result.page * result.pageSize);
  const previous = Math.max(1, result.page - 1);
  const next = Math.min(result.totalPages, result.page + 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
      <p className="text-xs text-[var(--muted)]">
        Showing {start}-{end} of {result.total} events
      </p>
      <div className="flex items-center gap-2">
        <Link
          aria-disabled={result.page <= 1}
          href={buildHref(result, previous)}
          className={`rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium ${result.page <= 1 ? "pointer-events-none opacity-40" : "hover:border-[var(--moss)]"}`}
        >
          Previous
        </Link>
        <span className="text-xs text-[var(--muted)]">Page {result.page} of {result.totalPages}</span>
        <Link
          aria-disabled={result.page >= result.totalPages}
          href={buildHref(result, next)}
          className={`rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium ${result.page >= result.totalPages ? "pointer-events-none opacity-40" : "hover:border-[var(--moss)]"}`}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

export function AuditTrailShell({ result }: AuditTrailShellProps) {
  const failures = result.logs.filter((log) => !log.success).length;
  const securityEvents = result.logs.filter((log) => log.action.startsWith("security.") || log.action.startsWith("auth.")).length;
  const uniqueActors = new Set(result.logs.map((log) => log.actor_email ?? log.actor_id).filter(Boolean)).size;

  return (
    <div className="scroll-soft h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-5">
        <section className="rounded-[28px] border border-[var(--line)] bg-[linear-gradient(135deg,rgba(144,50,61,0.16),rgba(255,255,255,0.025)_45%,rgba(10,9,8,0.9))] p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow text-[10px] text-[var(--muted)]">Audit trail</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Operational event monitor</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                Review critical customer, team, security, AI, billing, and configuration changes for this workspace. Logs are append-only and scoped to {result.orgScope.label.toLowerCase()}.
              </p>
            </div>
            <div className="rounded-[18px] border border-[var(--line)] bg-black/20 px-4 py-3">
              <p className="eyebrow text-[9px] text-[var(--muted)]">Org scope</p>
              <p className="mt-1 font-mono text-xs">{result.orgScope.id}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <StatCard label="Matching events" value={String(result.total)} detail="Across current filters" />
            <StatCard label="Visible actors" value={String(uniqueActors)} detail="On this page" />
            <StatCard label="Security/auth" value={String(securityEvents)} detail="On this page" />
            <StatCard label="Failures" value={String(failures)} detail="On this page" />
          </div>
        </section>

        <Filters result={result} />

        <Pagination result={result} />

        {result.logs.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {result.logs.map((log) => (
              <AuditEvent key={log.id} log={log} />
            ))}
          </div>
        )}

        {result.logs.length > 0 && <Pagination result={result} />}
      </div>
    </div>
  );
}
