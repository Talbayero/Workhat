"use client";

import Link from "next/link";
import { QAQueue } from "@/components/dashboard/qa-queue";
import { type EditTypeKey, type DashboardStats, type EditLogEntry, type KnowledgeHealthPattern } from "@/lib/supabase/queries";
import type { InboxConversation } from "@/lib/mock-data";

const editTypeLabel: Record<EditTypeKey, string> = {
  accepted: "Accepted",
  tone: "Tone fix",
  policy: "Policy gap",
  missing_context: "Missing context",
  factual: "Factual fix",
  structure: "Restructured",
  full_rewrite: "Full rewrite",
};

const editTypeColor: Record<EditTypeKey, string> = {
  accepted: "status-dot-green",
  tone: "status-dot-yellow",
  policy: "status-dot-red",
  missing_context: "status-dot-yellow",
  factual: "status-dot-red",
  structure: "status-dot-yellow",
  full_rewrite: "status-dot-red",
};

type DashboardShellProps = {
  stats: DashboardStats;
  log: EditLogEntry[];
  qaQueue: InboxConversation[];
  knowledgeHealth?: KnowledgeHealthPattern[];
  isDemo?: boolean;
  baseDir?: string;
};

function MetricCards({ stats }: { stats: DashboardStats }) {
  const cards = [
    {
      label: "AI draft acceptance",
      value: stats.totalEdits > 0 ? `${stats.acceptanceRate}%` : "—",
      delta:
        stats.totalEdits > 0
          ? `Based on ${stats.totalEdits} evaluated draft${stats.totalEdits !== 1 ? "s" : ""}`
          : "Send AI-drafted replies from the inbox to start tracking",
    },
    {
      label: "Avg. edit intensity",
      value: stats.totalEdits > 0 ? `${stats.avgEditIntensity}%` : "—",
      delta:
        stats.totalEdits > 0
          ? "Of AI draft words replaced per send on average"
          : "Measures how much agents rewrite each draft",
    },
    {
      label: "Top edit pattern",
      value: stats.topEditType ? editTypeLabel[stats.topEditType] : "—",
      delta:
        stats.topEditType
          ? `${stats.byType[stats.topEditType]} edit${stats.byType[stats.topEditType] !== 1 ? "s" : ""} of this type`
          : "Classifies why agents change AI drafts",
    },
  ];

  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-4"
        >
          <p className="text-xs text-[var(--muted)]">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold">{card.value}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{card.delta}</p>
        </div>
      ))}
    </div>
  );
}

function EditBreakdown({
  stats,
  hasData,
}: {
  stats: DashboardStats;
  hasData: boolean;
}) {
  return (
    <section className="grain-panel rounded-[24px] border border-[var(--line)] p-5">
      <p className="eyebrow text-[9px] text-[var(--muted)]">Edit reason breakdown</p>
      <h2 className="mt-1 text-base font-semibold">Why agents edit drafts</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        Classified by the edit capture pipeline on each confirmed reply.
      </p>

      {!hasData ? (
        <div className="mt-4 rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-6 text-center">
          <p className="text-sm text-[var(--muted)]">
            No edits captured yet. Use AI Draft in the inbox, modify the text, and confirm a send.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {(Object.entries(stats.byType) as [EditTypeKey, number][])
            .filter(([, count]) => count > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <div key={type} className="flex items-center gap-3">
                <span className={`status-dot shrink-0 ${editTypeColor[type]}`} />
                <span className="flex-1 text-sm">{editTypeLabel[type]}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--sage)]">
                    <div
                      className="h-full rounded-full bg-[var(--moss)]"
                      style={{
                        width: `${Math.round((count / stats.totalEdits) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-5 text-right text-xs text-[var(--muted)]">{count}</span>
                </div>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

function RecentEditLog({ log, baseDir = "" }: { log: EditLogEntry[]; baseDir?: string }) {
  return (
    <section className="grain-panel rounded-[24px] border border-[var(--line)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-[9px] text-[var(--muted)]">Edit log</p>
          <h2 className="mt-1 text-base font-semibold">Recent agent edits</h2>
        </div>
        <Link href={`${baseDir}/inbox`} className="text-xs text-[var(--moss)]">
          Open inbox
        </Link>
      </div>

      {log.length === 0 ? (
        <div className="mt-4 rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-6 text-center">
          <p className="text-sm text-[var(--muted)]">No edits yet.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {log.map((rec) => (
            <div
              key={rec.id}
              className="rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-3.5 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`status-dot ${editTypeColor[rec.editType]}`} />
                  <span className="text-sm font-medium">{editTypeLabel[rec.editType]}</span>
                </div>
                <span className="text-xs text-[var(--muted)]">{rec.editIntensity}% edited</span>
              </div>
              {rec.finalText && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                  {rec.finalText}
                </p>
              )}
              <Link
                href={`${baseDir}/inbox/${rec.conversationId}`}
                className="mt-1.5 inline-block text-[10px] text-[var(--moss)]"
              >
                View thread →
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function KnowledgeHealthCard({
  patterns,
  stats,
  baseDir = "",
}: {
  patterns: KnowledgeHealthPattern[];
  stats: DashboardStats;
  baseDir?: string;
}) {
  const hasPatterns = patterns.length > 0;
  const title = hasPatterns ? "Knowledge gaps driving edits" : "Knowledge base health";

  return (
    <section className="grain-panel rounded-[24px] border border-[var(--line)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow text-[9px] text-[var(--muted)]">Knowledge base health</p>
          <h2 className="mt-1 text-base font-semibold">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {hasPatterns
              ? "Based on the last 30 days of agent edits. These patterns show where a new SOP, policy note, or context entry could reduce rewrites."
              : stats.totalEdits > 0
                ? "No recurring edit cluster has emerged yet. Keep sending AI-assisted replies and this area will surface repeated policy or missing-context patterns."
                : "Once agents send AI-assisted replies, this area will show which knowledge gaps are creating the most edits."}
          </p>
        </div>
        <Link
          href={`${baseDir}/knowledge`}
          className="shrink-0 rounded-full bg-[var(--moss)] px-5 py-2.5 text-sm font-medium text-white"
        >
          Review knowledge base
        </Link>
      </div>

      {hasPatterns ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {patterns.map((pattern) => {
            const label = pattern.category === "other" ? "Other recurring edit" : editTypeLabel[pattern.category];
            return (
              <div
                key={pattern.category}
                className="rounded-[18px] border border-[var(--line)] bg-[var(--panel-strong)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {pattern.count} edit{pattern.count !== 1 ? "s" : ""} in 30 days
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] text-[var(--muted)]">
                    {pattern.avgEditIntensity}% avg edit
                  </span>
                </div>
                {pattern.sampleReasons.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {pattern.sampleReasons.slice(0, 2).map((reason) => (
                      <li key={reason} className="line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-[18px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-5 text-sm text-[var(--muted)]">
          No knowledge maintenance action needed yet.
        </div>
      )}
    </section>
  );
}

export function DashboardShell({
  stats,
  log,
  qaQueue,
  knowledgeHealth = [],
  isDemo = false,
  baseDir = "",
}: DashboardShellProps) {
  const hasEditData = stats.totalEdits > 0;

  return (
    <main className="h-full overflow-y-auto scroll-soft p-6">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header + metrics */}
        <section className="grain-panel rounded-[28px] border border-[var(--line)] p-7">
          <p className="eyebrow text-[10px] text-[var(--muted)]">Dashboard</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Measure AI improvement, not just activity
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Every reply your team sends from the inbox is analysed here. The goal
            is a shorter edit loop — not just faster replies.
          </p>
          <MetricCards stats={stats} />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <EditBreakdown stats={stats} hasData={hasEditData} />
          <RecentEditLog log={log} baseDir={baseDir} />
        </div>

        <QAQueue queue={qaQueue} isDemo={isDemo} baseDir={baseDir} />

        <KnowledgeHealthCard patterns={knowledgeHealth} stats={stats} baseDir={baseDir} />

      </div>
    </main>
  );
}
