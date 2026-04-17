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

type ReviewDraft = {
  score: string;
  notes: string;
  categories: string[];
};

const reviewLabel: Record<ReviewResult, string> = {
  approved: "Approved",
  flagged: "Flagged",
  needs_revision: "Needs revision",
};

const categoryOptions = [
  { value: "missing_context", label: "Missing context" },
  { value: "policy_risk", label: "Policy risk" },
  { value: "accuracy", label: "Accuracy" },
  { value: "tone", label: "Tone" },
  { value: "escalation", label: "Escalation" },
];

function emptyDraft(): ReviewDraft {
  return { score: "", notes: "", categories: [] };
}

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
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());

  const visibleQueue = queue.filter((conversation) => !clearedIds.has(conversation.id));
  const redQueue = visibleQueue.filter((c) => c.riskLevel === "red" || c.aiConfidence === "red");

  function getDraft(conversationId: string) {
    return drafts[conversationId] ?? emptyDraft();
  }

  function updateDraft(conversationId: string, patch: Partial<ReviewDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [conversationId]: { ...emptyDraft(), ...prev[conversationId], ...patch },
    }));
  }

  function toggleCategory(conversationId: string, category: string) {
    const draft = getDraft(conversationId);
    const categories = draft.categories.includes(category)
      ? draft.categories.filter((item) => item !== category)
      : [...draft.categories, category];

    updateDraft(conversationId, { categories });
  }

  async function submitReview(conversationId: string, result: ReviewResult) {
    const draft = getDraft(conversationId);
    setReviews((prev) => ({ ...prev, [conversationId]: { status: "saving", result } }));

    try {
      if (isDemo) {
        await new Promise((resolve) => setTimeout(resolve, 450));
      } else {
        const payload = {
          conversationId,
          result,
          score: draft.score,
          notes: draft.notes,
          categories: draft.categories,
        };

        const res = await fetch("/api/qa-reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
            Score risky threads, leave coaching notes, and keep clean approvals out of the queue.
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
            const draft = getDraft(conv.id);
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
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--sage)] px-2 py-0.5 text-[10px]">
                    {conv.intent}
                  </span>
                  <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                    Risk: {conv.riskLevel}
                  </span>
                  <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                    AI: {conv.aiConfidence}
                  </span>
                </div>

                {!done && (
                  <div className="mt-3 space-y-3 rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-3">
                    <div>
                      <label className="eyebrow text-[8px] text-[var(--muted)]" htmlFor={`score-${conv.id}`}>
                        QA score
                      </label>
                      <input
                        id={`score-${conv.id}`}
                        type="number"
                        min="0"
                        max="100"
                        inputMode="numeric"
                        value={draft.score}
                        onChange={(event) => updateDraft(conv.id, { score: event.target.value })}
                        placeholder="0-100 optional"
                        className="mt-1 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs outline-none transition-colors focus:border-[var(--rust)]"
                      />
                    </div>

                    <div>
                      <p className="eyebrow text-[8px] text-[var(--muted)]">Issue categories</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {categoryOptions.map((category) => {
                          const selected = draft.categories.includes(category.value);

                          return (
                            <button
                              key={category.value}
                              type="button"
                              onClick={() => toggleCategory(conv.id, category.value)}
                              className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                                selected
                                  ? "border-[rgba(144,50,61,0.45)] bg-[rgba(144,50,61,0.18)] text-[var(--foreground)]"
                                  : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)]"
                              }`}
                            >
                              {category.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="eyebrow text-[8px] text-[var(--muted)]" htmlFor={`notes-${conv.id}`}>
                        Reviewer note
                      </label>
                      <textarea
                        id={`notes-${conv.id}`}
                        value={draft.notes}
                        onChange={(event) => updateDraft(conv.id, { notes: event.target.value })}
                        placeholder="Optional coaching note or reason for the review result."
                        rows={2}
                        className="mt-1 w-full resize-none rounded-[12px] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs leading-5 outline-none transition-colors focus:border-[var(--rust)]"
                      />
                    </div>
                  </div>
                )}

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
