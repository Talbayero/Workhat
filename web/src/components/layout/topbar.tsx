"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type RouteMeta = {
  label: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
};

const routeMeta: Record<string, RouteMeta> = {
  inbox: {
    label: "Inbox",
    description: "Manage live conversations, review AI guidance, and keep replies moving.",
    actionLabel: "Open queue",
    actionHref: "/inbox",
  },
  contacts: {
    label: "Contacts",
    description: "Keep customer context connected to companies, owners, and conversation history.",
    actionLabel: "Browse contacts",
    actionHref: "/contacts",
  },
  companies: {
    label: "Companies",
    description: "Track account pressure, shared context, and connected customer records.",
    actionLabel: "Browse accounts",
    actionHref: "/companies",
  },
  knowledge: {
    label: "Knowledge",
    description: "Maintain the SOPs, policies, and tone rules that shape AI draft quality.",
    actionLabel: "Review entries",
    actionHref: "/knowledge",
  },
  dashboard: {
    label: "Dashboard",
    description: "Measure whether AI assistance is improving quality over time.",
    actionLabel: "View QA queue",
    actionHref: "/dashboard",
  },
  settings: {
    label: "Settings",
    description: "Control workspace structure, channels, team access, and AI rules.",
    actionLabel: "Open settings",
    actionHref: "/settings",
  },
};

function getPrimarySegment(pathname: string) {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment && routeMeta[segment] ? segment : "inbox";
}

export function Topbar() {
  const pathname = usePathname();
  const segment = getPrimarySegment(pathname);
  const meta = routeMeta[segment];
  const isDetailRoute = pathname.split("/").filter(Boolean).length > 1;

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[rgba(10,9,8,0.86)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
            <span className="eyebrow">Workspace</span>
            <span>/</span>
            <span>{meta.label}</span>
            {isDetailRoute ? (
              <>
                <span>/</span>
                <span className="text-[var(--foreground)]">Record</span>
              </>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">{meta.label}</h1>
            <span className="hidden rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-2.5 py-1 text-[10px] text-[var(--muted)] md:inline-flex">
              Harvest-inspired structure, Work Hat workflow
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">{meta.description}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <label className="hidden min-w-[240px] items-center gap-2 rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 lg:flex">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="6.25" cy="6.25" r="4.25" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search records, threads, and knowledge"
              className="w-full bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none"
            />
          </label>

          {meta.actionLabel && meta.actionHref ? (
            <Link
              href={meta.actionHref}
              className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--moss-strong)]"
            >
              {meta.actionLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
