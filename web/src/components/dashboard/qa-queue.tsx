"use client";

import Link from "next/link";
import { useState } from "react";
import type { InboxConversation } from "@/lib/mock-data";

type ReviewResult = "approved" | "flagged" | "needs_revision";

type ReviewState = {
  status: "idle" | "saving" | "done" | "error";
  result?: ReviewResult;
  message?: string;
};

const reviewLabel: Record<ReviewResult, string> = {
  approved: "Approved",
  flagged: "Flagged",
  needs_revision: "Needs revision",
};

export function QAQueue({
  queue,
  isDemo = false,
  baseDir = "",
}: {
  queue: InboxConversation[];
  isDemo?: boolean;
  baseDir?: string;
}) {
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());

  const visibleQueue = queue.filter((conversation) => !clearedIds.has(conversation.id));
  const redQueue = visibleQueue.filter((c) => c.riskLevel === "red" || c.aiConfidence === "red");

  async function submitReview(conversationId: string, result: ReviewResult) {
    setReviews((prev) => ({ ...prev, [conversationId]: { status: "saving", result } }));

    try {
      if (isDemo) {
        await new Promise((resolve) => setTimeout(resolve, 450));
      } else {
        const res = await fetch("/api/qa-reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, result }),
        });
        const data = await res.json().catch(() => ({})) as { error?: string };

        if (!res.ok) {
          throw new Error(data.error ?? `Review failed with HTTP ${res.status}`);
        }
      }

      setReviews((prev) => ({
        ...prev,
        [conversationId]: { status: "done", result, message: reviewLabel[result] },
      }));

      if (result === "approved") {
        window.setTimeout(() => {
          setClearedIds((prev) => new Set(prev).add(conversationId));
        }, 450);
      }
    } catch (error) {
      setReviews((prev) => ({
        ...prev,
        [conversationId]: {
          status: "error",
          result,
          message: error instanceof Error ? error.message : "Review failed. Please try again.",
        },
      }));
    }
  }

  return (
    <section className="grain-panel rounded-[24px] border border-[var(--line)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-[9px] text-[var(--muted)]">QA review queue</p>
          <h2 className="mt-1 text-base font-semibold">Threads needing attention</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Review high-risk threads, approve clean ones, and keep coaching gaps visible.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {redQueue.length > 0 && (
            <span className="rounded-full border border-[rgba(144,50,61,0.3)] bg-[rgba(144,50,61,0.18)] px-3 py-1.5 text-xs font-medium">
              {redQueue.length} urgent
            </span>
          )}
          <span className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs text-[var(--muted)]">
            {visibleQueue.length} open
          </span>
        </div>
      </div>

      {visibleQueue.length === 0 ? (
        <div className="mt-4 rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-6 text-center">
          <p className="text-sm text-[var(--muted)]">Queue is clear.</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Approved reviews will stay out of this list unless a new risk signal appears.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {visibleQueue.map((conv) => {
            const rev = reviews[conv.id];
            const done = rev?.status === "done";
            const saving = rev?.status === "saving";
            const hasError = rev?.status === "error";

            return (
              <div
                key={conv.id}
                className={`rounded-[16px] border bg-[var(--panel-strong)] p-4 transition-colors ${
                  done
                    ? rev.result === "approved"
                      ? "border-[rgba(120,161,122,0.4)] opacity-60"
                      : "border-[rgba(144,50,61,0.35)]"
                    : hasError
                      ? "border-[rgba(144,50,61,0.45)]"
                      : "border-[var(--line)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{conv.customerName}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{conv.companyName}</p>
                  </div>
                  <span
                    className={`status-dot mt-1 shrink-0 ${
                      conv.riskLevel === "red" ? "status-dot-red" : "status-dot-yellow"
                    }`}
                  />
                </div>
                <p className="mt-2 truncate text-xs font-medium">{conv.subject}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                  {conv.preview}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-full bg-[var(--sage)] px-2 py-0.5 text-[10px]">
                    {conv.intent}
                  </span>
                  <span className="text-[10px] text-[var(--muted)]">
                    AI: {conv.aiConfidence} confidence
                  </span>
                </div>

                {hasError && rev.message && (
                  <p className="mt-3 rounded-[12px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] px-3 py-2 text-xs leading-5 text-[rgba(255,220,220,0.95)]">
                    {rev.message}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-2 border-t border-[var(--line)] pt-3">
                  {done ? (
                    <div className="flex w-full items-center gap-2">
                      <span className={`text-xs font-medium ${
                        rev.result === "approved" ? "text-[var(--moss)]" : "text-[rgba(220,120,120,0.95)]"
                      }`}>
                        {rev.result === "approved" ? "Approved" : rev.result === "flagged" ? "Flagged" : "Needs revision"}
                      </span>
                      <Link
                        href={`${baseDir}/inbox/${conv.id}`}
                        className="ml-auto text-[10px] text-[var(--moss)] transition-colors hover:opacity-80"
                      >
                        View
                      </Link>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => submitReview(conv.id, "approved")}
                        disabled={saving}
                        className="rounded-full border border-[rgba(120,161,122,0.4)] bg-[rgba(120,161,122,0.08)] px-3 py-1 text-[10px] font-medium text-[var(--foreground)] transition-colors hover:bg-[rgba(120,161,122,0.18)] disabled:opacity-40"
                      >
                        {saving && rev?.result === "approved" ? "Saving..." : "Approve"}
                      </button>
                      <button
                        onClick={() => submitReview(conv.id, "needs_revision")}
                        disabled={saving}
                        className="rounded-full border border-[rgba(169,146,125,0.35)] px-3 py-1 text-[10px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)] disabled:opacity-40"
                      >
                        {saving && rev?.result === "needs_revision" ? "Saving..." : "Needs revision"}
                      </button>
                      <button
                        onClick={() => submitReview(conv.id, "flagged")}
                        disabled={saving}
                        className="rounded-full border border-[rgba(144,50,61,0.3)] px-3 py-1 text-[10px] font-medium text-[rgba(220,120,120,0.95)] transition-colors hover:bg-[rgba(144,50,61,0.08)] disabled:opacity-40"
                      >
                        {saving && rev?.result === "flagged" ? "Saving..." : "Flag"}
                      </button>
                      <Link
                        href={`${baseDir}/inbox/${conv.id}`}
                        className="ml-auto text-[10px] text-[var(--moss)] transition-colors hover:opacity-80"
                      >
                        View
                      </Link>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}