"use client";

import Link from "next/link";
import { useState } from "react";
import type { InboxConversation, RiskLevel } from "@/lib/mock-data";

type ActivePanel = "ai" | "profile" | null;

const confidenceLabel: Record<RiskLevel, string> = {
  green: "High confidence",
  yellow: "Review recommended",
  red: "Low confidence — edit carefully",
};

const confidenceDot: Record<RiskLevel, string> = {
  green: "status-dot-green",
  yellow: "status-dot-yellow",
  red: "status-dot-red",
};

const messageBg: Record<string, string> = {
  customer: "border-[var(--line)] bg-[var(--panel-strong)]",
  internal:
    "border-[rgba(169,146,125,0.2)] bg-[rgba(169,146,125,0.05)]",
  ai: "border-[rgba(144,50,61,0.25)] bg-[rgba(73,17,28,0.14)]",
  agent: "border-[var(--line)] bg-[var(--panel-strong)]",
};

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M1.5 1.5l12 12M13.5 1.5l-12 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ThreadWorkspace({
  conversation,
}: {
  conversation: InboxConversation;
}) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [replyText, setReplyText] = useState("");
  const [pendingSend, setPendingSend] = useState(false);

  function togglePanel(panel: ActivePanel) {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  function useDraft() {
    setReplyText(conversation.aiDraft.draftText);
    setActivePanel(null);
  }

  function handleSendClick() {
    if (!replyText.trim()) return;
    setPendingSend(true);
  }

  function confirmSend() {
    // Phase 2: wire to POST /api/conversations/:id/reply
    setReplyText("");
    setPendingSend(false);
    setActivePanel(null);
  }

  const panelOpen = activePanel !== null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main thread column ── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

        {/* Thread header */}
        <div className="shrink-0 border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              {/* Clicking customer name opens profile panel */}
              <button
                onClick={() => togglePanel("profile")}
                className="text-left group"
                aria-label={`View profile for ${conversation.customerName}`}
              >
                <p className="eyebrow text-[10px] text-[var(--muted)]">
                  {conversation.companyName}
                </p>
                <h2 className="mt-0.5 text-base font-semibold group-hover:text-[var(--moss)] transition-colors">
                  {conversation.customerName}
                </h2>
              </button>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {conversation.subject}
              </p>
            </div>

            {/* Confidence indicator */}
            <div className="shrink-0 flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
              <span
                className={`status-dot ${confidenceDot[conversation.aiConfidence]}`}
              />
              <span className="text-xs text-[var(--muted)]">
                {confidenceLabel[conversation.aiConfidence]}
              </span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scroll-soft px-5 py-4 space-y-3">
          {conversation.messages.map((message) => (
            <article
              key={message.id}
              className={`rounded-[20px] border px-4 py-3.5 ${
                messageBg[message.senderType] ?? messageBg.agent
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{message.sender}</span>
                  <span className="eyebrow text-[9px] text-[var(--muted)]">
                    {message.senderType}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {message.timestamp}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6">{message.body}</p>
            </article>
          ))}
        </div>

        {/* Reply composer */}
        <div className="shrink-0 border-t border-[var(--line)] p-4">
          {pendingSend ? (
            /* Confirmation gate — no AI draft ever sends without explicit approval */
            <div className="rounded-[20px] border border-[var(--line-strong)] bg-[var(--panel-strong)] p-4">
              <p className="text-sm font-medium">Send this reply?</p>
              <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                {replyText}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={confirmSend}
                  className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white"
                >
                  Confirm send
                </button>
                <button
                  onClick={() => setPendingSend(false)}
                  className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium text-[var(--foreground)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] overflow-hidden">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply…"
                rows={3}
                className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm leading-6 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none"
              />
              <div className="flex items-center gap-2 border-t border-[var(--line)] px-3 py-2.5">
                <button
                  onClick={handleSendClick}
                  disabled={!replyText.trim()}
                  className="rounded-full bg-[var(--moss)] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
                >
                  Send
                </button>
                <button
                  onClick={() => togglePanel("ai")}
                  className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
                    activePanel === "ai"
                      ? "border-[var(--moss)] bg-[rgba(144,50,61,0.12)] text-[var(--foreground)]"
                      : "border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  AI Draft
                </button>
                <button className="rounded-full border border-[var(--line-strong)] px-4 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                  Note
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Slide-in panel ── */}
      {/* Width transitions from 0 to 320px. overflow-hidden clips content during animation. */}
      <div
        className={`shrink-0 border-l border-[var(--line)] overflow-hidden transition-all duration-200 ease-in-out ${
          panelOpen ? "w-[320px]" : "w-0"
        }`}
      >
        {/* AI Draft panel */}
        {activePanel === "ai" && (
          <div className="flex h-full w-[320px] flex-col overflow-hidden">
            <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="eyebrow text-[10px] text-[var(--muted)]">
                  AI Draft
                </p>
                <button
                  onClick={() => setActivePanel(null)}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  aria-label="Close AI draft panel"
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`status-dot ${confidenceDot[conversation.aiConfidence]}`}
                />
                <span className="text-xs text-[var(--muted)] capitalize">
                  {conversation.aiConfidence} confidence
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scroll-soft p-4 space-y-3">
              {/* Draft text */}
              <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                <p className="text-sm leading-6">{conversation.aiDraft.draftText}</p>
              </div>

              {/* Use this draft */}
              <button
                onClick={useDraft}
                className="w-full rounded-full bg-[var(--moss)] px-4 py-2.5 text-sm font-medium text-white"
              >
                Use this draft
              </button>

              {/* Rationale */}
              <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                <p className="eyebrow text-[9px] text-[var(--muted)]">
                  Why this response
                </p>
                <p className="mt-2 text-sm leading-6">
                  {conversation.aiDraft.rationale}
                </p>
              </div>

              {/* Missing context */}
              {conversation.aiDraft.missingContext.length > 0 && (
                <div className="rounded-[16px] border border-[rgba(169,146,125,0.25)] bg-[rgba(169,146,125,0.05)] p-4">
                  <p className="eyebrow text-[9px] text-[var(--amber)]">
                    Missing context
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {conversation.aiDraft.missingContext.map((item) => (
                      <li
                        key={item}
                        className="flex gap-2 text-sm leading-5"
                      >
                        <span className="shrink-0 text-[var(--muted)]">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {conversation.aiDraft.suggestions.length > 0 && (
                <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                  <p className="eyebrow text-[9px] text-[var(--muted)]">
                    Suggestions
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {conversation.aiDraft.suggestions.map((item) => (
                      <li
                        key={item}
                        className="flex gap-2 text-sm leading-5"
                      >
                        <span className="shrink-0 text-[var(--muted)]">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Customer profile panel */}
        {activePanel === "profile" && (
          <div className="flex h-full w-[320px] flex-col overflow-hidden">
            <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="eyebrow text-[10px] text-[var(--muted)]">
                  Customer profile
                </p>
                <button
                  onClick={() => setActivePanel(null)}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  aria-label="Close customer profile panel"
                >
                  <CloseIcon />
                </button>
              </div>
              <h3 className="mt-2 text-base font-semibold">
                {conversation.customerName}
              </h3>
              <p className="text-xs text-[var(--muted)]">
                {conversation.companyName}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto scroll-soft p-4 space-y-3">
              {/* Contact details */}
              <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4 space-y-3">
                <div>
                  <p className="eyebrow text-[9px] text-[var(--muted)]">Email</p>
                  <p className="mt-1 text-sm">{conversation.profile.email}</p>
                </div>
                <div>
                  <p className="eyebrow text-[9px] text-[var(--muted)]">Phone</p>
                  <p className="mt-1 text-sm">{conversation.profile.phone}</p>
                </div>
                <div>
                  <p className="eyebrow text-[9px] text-[var(--muted)]">
                    Account tier
                  </p>
                  <p className="mt-1 text-sm">{conversation.profile.tier}</p>
                </div>
                <Link
                  href={`/contacts/${conversation.contactId}`}
                  className="inline-flex rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[var(--moss)] hover:bg-[var(--moss)] hover:text-white"
                >
                  Open full contact record
                </Link>
              </div>

              {/* Notes */}
              {conversation.profile.notes.length > 0 && (
                <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                  <p className="eyebrow text-[9px] text-[var(--muted)]">Notes</p>
                  <ul className="mt-2 space-y-2">
                    {conversation.profile.notes.map((note) => (
                      <li key={note} className="flex gap-2 text-sm leading-5">
                        <span className="shrink-0 text-[var(--muted)]">·</span>
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Open issues */}
              {conversation.profile.openIssues.length > 0 && (
                <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                  <p className="eyebrow text-[9px] text-[var(--muted)]">
                    Open issues
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {conversation.profile.openIssues.map((issue) => (
                      <li key={issue} className="flex gap-2 text-sm leading-5">
                        <span className="shrink-0 text-[var(--muted)]">·</span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
