import Link from "next/link";
import type { ContextListStatusFilter, ContextObjectSummary } from "@/lib/context/types";

const statusTabs: Array<{ id: ContextListStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Drafts" },
  { id: "archived", label: "Archived" },
];

function statusBadge(status: ContextObjectSummary["status"]) {
  if (status === "active") {
    return "border-[rgba(22,163,74,0.35)] bg-[rgba(22,163,74,0.08)] text-[rgba(22,163,74,0.92)]";
  }

  if (status === "archived") {
    return "border-[var(--line)] bg-[rgba(255,255,255,0.03)] text-[var(--muted)]";
  }

  return "border-[rgba(169,146,125,0.28)] bg-[rgba(169,146,125,0.08)] text-[var(--foreground)]";
}

export function ContextLibrary({
  contexts,
  activeStatus,
  canEdit,
}: {
  contexts: ContextObjectSummary[];
  activeStatus: ContextListStatusFilter;
  canEdit: boolean;
}) {
  const counts = {
    all: contexts.length,
    active: contexts.filter((item) => item.status === "active").length,
    draft: contexts.filter((item) => item.status === "draft").length,
    archived: contexts.filter((item) => item.status === "archived").length,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--line)] px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-[10px] text-[var(--muted)]">Operational context</p>
            <h1 className="mt-1 text-xl font-semibold">Context Library</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Published context objects guide AI drafts with operational rules, escalation cues, and linked knowledge.
            </p>
          </div>
          {canEdit && (
            <Link
              href="/contexts/new"
              className="rounded-full bg-[var(--moss)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              New context
            </Link>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {statusTabs.map((tab) => {
            const href = tab.id === "all" ? "/contexts" : `/contexts?status=${tab.id}`;
            const isActive = tab.id === activeStatus;
            return (
              <Link
                key={tab.id}
                href={href}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--moss)] text-white"
                    : "border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {tab.label}{" "}
                <span className={isActive ? "text-white/80" : "text-[var(--muted)]"}>
                  {counts[tab.id]}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="scroll-soft flex-1 overflow-y-auto px-5 py-5">
        {contexts.length === 0 ? (
          <div className="rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] px-8 py-10 text-center">
            <p className="eyebrow text-[10px] text-[var(--muted)]">Context Library</p>
            <h2 className="mt-3 text-lg font-semibold">No context objects yet</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Start with one operational context for a common company scenario or QA policy. Keep it simple and publish only what agents should actually use.
            </p>
            {canEdit && (
              <Link
                href="/contexts/new"
                className="mt-5 inline-flex rounded-full bg-[var(--moss)] px-5 py-2.5 text-sm font-medium text-white"
              >
                Create first context
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {contexts.map((contextObject) => (
              <Link
                key={contextObject.id}
                href={`/contexts/${contextObject.id}`}
                className="rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-5 transition-colors hover:border-[var(--moss)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{contextObject.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      {contextObject.description || "No description yet."}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium capitalize ${statusBadge(contextObject.status)}`}>
                    {contextObject.status}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  <span className="rounded-full border border-[var(--line)] px-2.5 py-1">
                    {contextObject.category}
                  </span>
                  {contextObject.companyName && (
                    <span className="rounded-full border border-[var(--line)] px-2.5 py-1">
                      {contextObject.companyName}
                    </span>
                  )}
                  {contextObject.activeVersionNumber !== null && (
                    <span className="rounded-full border border-[rgba(22,163,74,0.3)] px-2.5 py-1 text-[rgba(22,163,74,0.92)]">
                      Active v{contextObject.activeVersionNumber}
                    </span>
                  )}
                  {contextObject.currentVersionNumber !== null && (
                    <span className="rounded-full border border-[var(--line)] px-2.5 py-1">
                      Working v{contextObject.currentVersionNumber}
                    </span>
                  )}
                </div>

                <p className="mt-4 text-[11px] text-[var(--muted)]">
                  Updated {new Date(contextObject.updatedAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
