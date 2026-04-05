"use client";

import Link from "next/link";
import { computeEditStats, getEditLog, type EditType } from "@/lib/edit-analysis";
import { conversations } from "@/lib/mock-data";

const editTypeLabel: Record<EditType, string> = {
  accepted: "Accepted",
  tone: "Tone fix",
  policy: "Policy gap",
  missing_context: "Missing context",
  factual: "Factual fix",
  structure: "Restructured",
  full_rewrite: "Full rewrite",
};

const editTypeColor: Record<EditType, string> = {
  accepted: "status-dot-green",
  tone: "status-dot-yellow",
  policy: "status-dot-red",
  missing_context: "status-dot-yellow",
  factual: "status-dot-red",
  structure: "status-dot-yellow",
  full_rewrite: "status-dot-red",
};

// Threads that need QA attention: high-risk or low AI confidence
const qaQueue = conversations.filter(
  (c) => c.riskLevel === "red" || c.aiConfidence === "red" || c.aiConfidence === "yellow",
);

export default function DashboardPage() {
  const stats = computeEditStats();
  const log = getEditLog();

  const metricCards = [
    {
      label: "AI draft acceptance",
      value: stats.totalEdits > 0 ? `${stats.acceptanceRate}%` : "—",
      delta: stats.totalEdits > 0
        ? `${stats.totalEdits} drafts evaluated this session`
        : "Send replies from the inbox to track",
    },
    {
      label: "Avg. edit intensity",
      value: stats.totalEdits > 0 ? `${stats.avgEditIntensity}%` : "—",
      delta: stats.totalEdits > 0
        ? "Of AI draft words replaced on average"
        : "Measures how much agents rewrite drafts",
    },
    {
      label: "Top edit pattern",
      value: stats.topEditType ? editTypeLabel[stats.topEditType] : "—",
      delta: stats.topEditType
        ? `${stats.byType[stats.topEditType]} edits of this type`
        : "Classifies why agents edit drafts",
    },
  ];

  return (
    <main className="h-full overflow-y-auto scroll-soft p-6">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <section className="grain-panel rounded-[28px] border border-[var(--line)] p-7">
          <p className="eyebrow text-[10px] text-[var(--muted)]">Dashboard</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Measure AI improvement, not just activity
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Every reply your team sends from the inbox is analysed here. The goal
            is a shorter edit loop — not just faster replies.
          </p>

          {/* Live metric cards */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {metricCards.map((card) => (
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
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Edit type breakdown */}
          <section className="grain-panel rounded-[24px] border border-[var(--line)] p-5">
            <p className="eyebrow text-[9px] text-[var(--muted)]">Edit reason breakdown</p>
            <h2 className="mt-1 text-base font-semibold">Why agents edit drafts</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Classified by the edit capture pipeline on each confirmed reply.
            </p>

            {log.length === 0 ? (
              <div className="mt-4 rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-6 text-center">
                <p className="text-sm text-[var(--muted)]">
                  No edits captured yet. Use AI Draft in the inbox, modify the
                  text, and confirm a send.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {(Object.entries(stats.byType) as [EditType, number][])
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
                              width: `${Math.round((count / log.length) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="w-5 text-right text-xs text-[var(--muted)]">
                          {count}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* Recent edit log */}
          <section className="grain-panel rounded-[24px] border border-[var(--line)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow text-[9px] text-[var(--muted)]">Edit log</p>
                <h2 className="mt-1 text-base font-semibold">Recent agent edits</h2>
              </div>
              <Link
                href="/inbox"
                className="text-xs text-[var(--moss)]"
              >
                Open inbox
              </Link>
            </div>

            {log.length === 0 ? (
              <div className="mt-4 rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-6 text-center">
                <p className="text-sm text-[var(--muted)]">No edits yet this session.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {[...log].reverse().slice(0, 6).map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-3.5 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`status-dot ${editTypeColor[rec.editType]}`} />
                        <span className="text-sm font-medium">
                          {editTypeLabel[rec.editType]}
                        </span>
                      </div>
                      <span className="text-xs text-[var(--muted)]">
                        {rec.editIntensity}% edited
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                      {rec.finalText}
                    </p>
                    <Link
                      href={`/inbox/${rec.conversationId}`}
                      className="mt-1.5 inline-block text-[10px] text-[var(--moss)]"
                    >
                      View thread →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* QA Review Queue */}
        <section className="grain-panel rounded-[24px] border border-[var(--line)] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-[9px] text-[var(--muted)]">QA review queue</p>
              <h2 className="mt-1 text-base font-semibold">
                Threads needing attention
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                High-risk threads and low AI confidence conversations. Review
                before they escalate.
              </p>
            </div>
            <span className="rounded-full bg-[rgba(144,50,61,0.18)] border border-[rgba(144,50,61,0.3)] px-3 py-1.5 text-xs font-medium">
              {qaQueue.length} flagged
            </span>
          </div>

          {qaQueue.length === 0 ? (
            <div className="mt-4 rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-6 text-center">
              <p className="text-sm text-[var(--muted)]">Queue is clear.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {qaQueue.map((conv) => (
                <Link
                  key={conv.id}
                  href={`/inbox/${conv.id}`}
                  className="block rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4 transition-colors hover:border-[var(--line-strong)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {conv.customerName}
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {conv.companyName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="eyebrow text-[9px] text-[var(--muted)]">
                        risk
                      </span>
                      <span
                        className={`status-dot ${
                          conv.riskLevel === "red"
                            ? "status-dot-red"
                            : "status-dot-yellow"
                        }`}
                      />
                    </div>
                  </div>
                  <p className="mt-2 truncate text-xs font-medium">{conv.subject}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                    {conv.preview}
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="rounded-full bg-[var(--sage)] px-2 py-0.5 text-[10px]">
                      {conv.intent}
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">
                      AI: {conv.aiConfidence} confidence
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Knowledge maintenance signal */}
        <section className="grain-panel rounded-[24px] border border-[var(--line)] p-5">
          <p className="eyebrow text-[9px] text-[var(--muted)]">Knowledge base health</p>
          <h2 className="mt-1 text-base font-semibold">
            Entries driving the most edits
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Phase 2 will surface knowledge entries that correlate with high edit
            intensity — a signal they need updating. For now, review entries
            directly.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/knowledge"
              className="rounded-full bg-[var(--moss)] px-5 py-2.5 text-sm font-medium text-white"
            >
              Review knowledge base
            </Link>
            <Link
              href="/inbox"
              className="rounded-full border border-[var(--line-strong)] px-5 py-2.5 text-sm font-medium"
            >
              Open inbox
            </Link>
          </div>
        </section>

      </div>
    </main>
  );
}
