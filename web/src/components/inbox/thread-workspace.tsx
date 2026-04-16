"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import type { InboxConversation, RiskLevel } from "@/lib/mock-data";
import { recordEdit, type EditRecord } from "@/lib/edit-analysis";
import type { ConfidenceLevel } from "@/lib/ai/types";

type LocalMessage = InboxConversation["messages"][number];
type ConversationStatus = InboxConversation["status"];

type ActivePanel = "ai" | "profile" | null;
type ComposerMode = "reply" | "note";

// Shape returned by POST /api/ai/draft
type LiveDraft = {
  id: string | null;
  draftText: string;
  rationale: string;
  confidenceLevel: ConfidenceLevel;
  riskFlags: string[];
  missingContext: string[];
  recommendedTags: string[];
  latencyMs: number;
};

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
  isDemo = false,
}: {
  conversation: InboxConversation;
  isDemo?: boolean;
}) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode>("reply");
  const [replyText, setReplyText] = useState("");
  const [pendingSend, setPendingSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastEditRecord, setLastEditRecord] = useState<EditRecord | null>(null);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>(conversation.messages);
  const [status, setStatus] = useState<ConversationStatus>(conversation.status);
  const [assignee, setAssignee] = useState(conversation.assignee);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [editingAssignee, setEditingAssignee] = useState(false);
  const [assigneeInput, setAssigneeInput] = useState(conversation.assignee);

  // Live AI draft state
  const [liveDraft, setLiveDraft] = useState<LiveDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  // Call the real API to generate a draft
  const generateDraft = useCallback(async () => {
    if (draftLoading) return;
    setDraftLoading(true);
    setDraftError(null);
    try {
      if (isDemo) {
        // Mock delay for "thinking" feel
        await new Promise((resolve) => setTimeout(resolve, 800));
        setLiveDraft({
          id: "demo-draft-123",
          draftText: conversation.aiDraft.draftText,
          rationale: conversation.aiDraft.rationale,
          confidenceLevel: conversation.aiConfidence as ConfidenceLevel,
          riskFlags: ["DEMO_MODE", "MOCK_CONTEXT"],
          missingContext: conversation.aiDraft.missingContext,
          recommendedTags: conversation.tags,
          latencyMs: 800,
        });
      } else {
        const res = await fetch(`/api/ai/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: conversation.id }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        setLiveDraft(data.draft as LiveDraft);
      }
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Draft generation failed");
    } finally {
      setDraftLoading(false);
    }
  }, [conversation.id, draftLoading, isDemo, conversation.aiDraft, conversation.aiConfidence, conversation.tags]);

  function togglePanel(panel: ActivePanel) {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  // Open AI panel and auto-generate if no draft yet
  function openAIPanel() {
    setActivePanel("ai");
    if (!liveDraft && !draftLoading) {
      generateDraft();
    }
  }

  function useDraft() {
    const text = liveDraft?.draftText ?? conversation.aiDraft.draftText;
    setComposerMode("reply");
    setReplyText(text);
    setActivePanel(null);
  }

  async function updateConversation(patch: Record<string, unknown>) {
    if (isDemo) return;

    await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function handleStatusChange(newStatus: ConversationStatus) {
    setStatusUpdating(true);
    setStatus(newStatus);
    await updateConversation({ status: newStatus });
    setStatusUpdating(false);
  }

  async function handleClaim() {
    const name = "You";
    setAssignee(name);
    setAssigneeInput(name);
    await updateConversation({ assigned_to_name: name });
  }

  async function handleAssigneeSave() {
    const name = assigneeInput.trim();
    setEditingAssignee(false);
    if (name === assignee) return;
    setAssignee(name);
    await updateConversation({ assigned_to_name: name });
  }

  function switchMode(mode: ComposerMode) {
    setComposerMode(mode);
    setReplyText("");
    setPendingSend(false);
    setSendError(null);
    if (mode === "note") setActivePanel(null);
  }

  function handleSendClick() {
    if (!replyText.trim()) return;
    setSendError(null);
    setPendingSend(true);
  }

  async function confirmSend() {
    if (sending) return;
    setSending(true);
    setSendError(null);

    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const textToSend = replyText;

    try {
      if (!isDemo) {
        const endpoint =
          composerMode === "reply"
            ? `/api/conversations/${conversation.id}/reply`
            : `/api/conversations/${conversation.id}/note`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            composerMode === "reply"
              ? { body: textToSend, aiDraftId: liveDraft?.id ?? null }
              : { body: textToSend }
          ),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as { error?: string; hint?: string };
          throw new Error([data.error, data.hint].filter(Boolean).join(" ") || `HTTP ${response.status}`);
        }
      } else {
        // Mock network delay
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      const newMessage: LocalMessage = {
        id: `local-${Date.now()}`,
        sender: composerMode === "note" ? "Internal note" : "You (agent)",
        senderType: composerMode === "note" ? "internal" : "agent",
        timestamp,
        body: textToSend,
      };
      setLocalMessages((prev) => [...prev, newMessage]);

      if (composerMode === "reply") {
        const record = recordEdit(
          conversation.id,
          liveDraft?.draftText ?? conversation.aiDraft.draftText,
          textToSend,
        );
        setLastEditRecord(record);
      }

      setReplyText("");
      setPendingSend(false);
      setActivePanel(null);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const panelOpen = activePanel !== null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main thread column ── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

        {/* Thread header */}
        <div className="shrink-0 border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
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
              <p className="mt-1 truncate text-sm text-[var(--muted)]">
                {conversation.subject}
              </p>
              {/* Status + assignee row */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* Status dropdown */}
                <select
                  value={status}
                  disabled={statusUpdating}
                  onChange={(e) => handleStatusChange(e.target.value as ConversationStatus)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-medium bg-transparent cursor-pointer outline-none disabled:opacity-50 ${
                    status === "resolved" || status === "archived"
                      ? "border-[var(--line)] text-[var(--muted)]"
                      : status === "open"
                      ? "border-[rgba(120,161,122,0.25)] bg-[rgba(120,161,122,0.05)] text-[var(--foreground)]"
                      : status === "waiting_on_customer"
                      ? "border-[rgba(120,161,122,0.4)] bg-[rgba(120,161,122,0.1)] text-[var(--foreground)]"
                      : "border-[rgba(169,146,125,0.35)] bg-[rgba(169,146,125,0.08)] text-[var(--foreground)]"
                  }`}
                >
                  <option value="open">Open</option>
                  <option value="waiting_on_customer">Waiting on customer</option>
                  <option value="waiting_on_internal">Waiting on team</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="archived">Archived</option>
                </select>

                {/* Assignee */}
                {editingAssignee ? (
                  <input
                    autoFocus
                    value={assigneeInput}
                    onChange={(e) => setAssigneeInput(e.target.value)}
                    onBlur={handleAssigneeSave}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAssigneeSave(); if (e.key === "Escape") setEditingAssignee(false); }}
                    placeholder="Assign to…"
                    className="rounded-full border border-[var(--moss)] bg-transparent px-2.5 py-1 text-[10px] outline-none text-[var(--foreground)] w-28"
                  />
                ) : assignee ? (
                  <button
                    onClick={() => { setAssigneeInput(assignee); setEditingAssignee(true); }}
                    className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  >
                    Assigned to {assignee} ✎
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-[rgba(169,146,125,0.3)] px-2.5 py-1 text-[10px] text-[var(--muted)]">
                      Unassigned
                    </span>
                    <button
                      onClick={handleClaim}
                      className="rounded-full border border-[var(--moss)] px-2.5 py-1 text-[10px] font-medium text-[var(--moss)] transition-colors hover:bg-[var(--moss)] hover:text-white"
                    >
                      Claim
                    </button>
                    <button
                      onClick={() => { setAssigneeInput(""); setEditingAssignee(true); }}
                      className="rounded-full border border-[var(--line-strong)] px-2.5 py-1 text-[10px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                    >
                      Assign
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right side: AI confidence + quick Resolve/Reopen */}
            <div className="shrink-0 flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                <span className={`status-dot ${confidenceDot[conversation.aiConfidence]}`} />
                <span className="text-xs text-[var(--muted)]">
                  {confidenceLabel[conversation.aiConfidence]}
                </span>
              </div>
              {status !== "resolved" ? (
                <button
                  onClick={() => handleStatusChange("resolved")}
                  disabled={statusUpdating}
                  className="rounded-full border border-[rgba(120,161,122,0.4)] bg-[rgba(120,161,122,0.08)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-[rgba(120,161,122,0.18)] disabled:opacity-50"
                >
                  ✓ Resolve
                </button>
              ) : (
                <button
                  onClick={() => handleStatusChange("open")}
                  disabled={statusUpdating}
                  className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)] disabled:opacity-50"
                >
                  Reopen
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scroll-soft px-5 py-4 space-y-3">
          {localMessages.map((message) => (
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
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>

        {/* Edit capture feedback — shows after a reply is confirmed */}
        {lastEditRecord && (
          <div className="shrink-0 border-t border-[var(--line)] px-5 py-3">
            <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="status-dot status-dot-green" />
                <span className="text-xs text-[var(--muted)]">
                  Edit logged —{" "}
                  <span className="text-[var(--foreground)] capitalize">
                    {lastEditRecord.editType.replace(/_/g, " ")}
                  </span>{" "}
                  · {lastEditRecord.editIntensity}% edit intensity
                </span>
              </div>
              <button
                onClick={() => setLastEditRecord(null)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                aria-label="Dismiss"
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="shrink-0 border-t border-[var(--line)] p-4">
          {/* Mode tabs */}
          {!pendingSend && (
            <div className="mb-3 flex gap-1.5">
              <button
                onClick={() => switchMode("reply")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  composerMode === "reply"
                    ? "bg-[var(--moss)] text-white"
                    : "border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Reply
              </button>
              <button
                onClick={() => switchMode("note")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  composerMode === "note"
                    ? "bg-[rgba(169,146,125,0.2)] border border-[rgba(169,146,125,0.4)] text-[var(--foreground)]"
                    : "border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Internal note
              </button>
            </div>
          )}

          {pendingSend ? (
            /* Confirmation gate — no message ever sends without explicit approval */
            <div className="rounded-[20px] border border-[var(--line-strong)] bg-[var(--panel-strong)] p-4">
              <p className="text-sm font-medium">
                {composerMode === "note" ? "Post this internal note?" : "Send this reply?"}
              </p>
              <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                {replyText}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={confirmSend}
                  disabled={sending}
                  className={`rounded-full px-4 py-2 text-xs font-medium text-white ${
                    composerMode === "note"
                      ? "bg-[rgba(169,146,125,0.55)]"
                      : "bg-[var(--moss)]"
                  } disabled:opacity-50`}
                >
                  {sending
                    ? composerMode === "note" ? "Posting..." : "Sending..."
                    : composerMode === "note" ? "Confirm note" : "Confirm send"}
                </button>
                <button
                  onClick={() => { setPendingSend(false); setSendError(null); }}
                  disabled={sending}
                  className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium text-[var(--foreground)]"
                >
                  Cancel
                </button>
              </div>
              {sendError && (
                <p className="mt-3 rounded-[12px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] px-3 py-2 text-xs leading-5">
                  {sendError}
                </p>
              )}
            </div>
          ) : composerMode === "note" ? (
            /* Internal note composer — amber tint, no AI draft button */
            <div className="rounded-[20px] border border-[rgba(169,146,125,0.3)] bg-[rgba(169,146,125,0.06)] overflow-hidden">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write an internal note — only visible to your team…"
                rows={3}
                className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm leading-6 text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none"
              />
              <div className="flex items-center gap-2 border-t border-[rgba(169,146,125,0.2)] px-3 py-2.5">
                <button
                  onClick={handleSendClick}
                  disabled={!replyText.trim()}
                  className="rounded-full bg-[rgba(169,146,125,0.45)] px-4 py-1.5 text-xs font-medium text-[var(--foreground)] disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
                >
                  Post note
                </button>
                <span className="text-[10px] text-[var(--muted)]">
                  Not sent to customer
                </span>
              </div>
            </div>
          ) : (
            /* Reply composer */
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
                  onClick={openAIPanel}
                  className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
                    activePanel === "ai"
                      ? "border-[var(--moss)] bg-[rgba(144,50,61,0.12)] text-[var(--foreground)]"
                      : "border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {draftLoading ? "Drafting…" : liveDraft ? "AI Draft ✓" : "AI Draft"}
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
            {/* Panel header */}
            <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="eyebrow text-[10px] text-[var(--muted)]">AI Draft</p>
                <button
                  onClick={() => setActivePanel(null)}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  aria-label="Close AI draft panel"
                >
                  <CloseIcon />
                </button>
              </div>
              {liveDraft && (
                <div className="mt-2 flex items-center gap-2">
                  <span className={`status-dot ${confidenceDot[liveDraft.confidenceLevel]}`} />
                  <span className="text-xs text-[var(--muted)] capitalize">
                    {liveDraft.confidenceLevel} confidence
                  </span>
                  <span className="ml-auto text-[9px] text-[var(--muted)]">
                    {liveDraft.latencyMs}ms
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto scroll-soft p-4 space-y-3">

              {/* Loading state */}
              {draftLoading && (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--moss)] border-t-transparent" />
                  <p className="text-xs text-[var(--muted)]">Generating draft…</p>
                </div>
              )}

              {/* Error state */}
              {draftError && !draftLoading && (
                <div className="rounded-[16px] border border-[rgba(144,50,61,0.3)] bg-[rgba(73,17,28,0.1)] p-4">
                  <p className="eyebrow text-[9px] text-[var(--rose)]">Generation failed</p>
                  <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">{draftError}</p>
                  <button
                    onClick={generateDraft}
                    className="mt-3 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[var(--moss)] hover:text-[var(--moss)]"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Live draft content */}
              {liveDraft && !draftLoading && (
                <>
                  {/* Draft text */}
                  <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="text-sm leading-6 whitespace-pre-wrap">{liveDraft.draftText}</p>
                  </div>

                  {/* Use this draft */}
                  <button
                    onClick={useDraft}
                    className="w-full rounded-full bg-[var(--moss)] px-4 py-2.5 text-sm font-medium text-white"
                  >
                    Use this draft
                  </button>

                  {/* Regenerate */}
                  <button
                    onClick={generateDraft}
                    className="w-full rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                  >
                    Regenerate
                  </button>

                  {/* Rationale */}
                  <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Why this response</p>
                    <p className="mt-2 text-sm leading-6">{liveDraft.rationale}</p>
                  </div>

                  {/* Risk flags */}
                  {liveDraft.riskFlags.length > 0 && (
                    <div className="rounded-[16px] border border-[rgba(144,50,61,0.25)] bg-[rgba(73,17,28,0.08)] p-4">
                      <p className="eyebrow text-[9px] text-[var(--rose)]">Risk flags</p>
                      <ul className="mt-2 space-y-1.5">
                        {liveDraft.riskFlags.map((flag) => (
                          <li key={flag} className="flex gap-2 text-xs leading-5 font-mono text-[var(--muted)]">
                            <span className="shrink-0">·</span>
                            {flag}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Missing context */}
                  {liveDraft.missingContext.length > 0 && (
                    <div className="rounded-[16px] border border-[rgba(169,146,125,0.25)] bg-[rgba(169,146,125,0.05)] p-4">
                      <p className="eyebrow text-[9px] text-[var(--amber)]">Missing context</p>
                      <ul className="mt-2 space-y-1.5">
                        {liveDraft.missingContext.map((item) => (
                          <li key={item} className="flex gap-2 text-sm leading-5">
                            <span className="shrink-0 text-[var(--muted)]">·</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommended tags */}
                  {liveDraft.recommendedTags.length > 0 && (
                    <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                      <p className="eyebrow text-[9px] text-[var(--muted)]">Recommended tags</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {liveDraft.recommendedTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-[var(--line-strong)] px-2.5 py-1 text-[10px] text-[var(--muted)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Empty state — no draft yet and not loading */}
              {!liveDraft && !draftLoading && !draftError && (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <p className="text-xs text-[var(--muted)]">No draft generated yet.</p>
                  <button
                    onClick={generateDraft}
                    className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white"
                  >
                    Generate draft
                  </button>
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
