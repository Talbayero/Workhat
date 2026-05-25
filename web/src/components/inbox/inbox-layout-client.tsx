"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { NewConversationButton } from "@/components/inbox/new-conversation-button";
import { ThreadWorkspace } from "@/components/inbox/thread-workspace";
import {
  conversationStatusLabel,
  inboxViews,
} from "@/lib/inbox/filters";
import {
  getConversationEmailClassification,
  isDefaultOperationalConversation,
} from "@/lib/inbox/classification";
import type { InboxConversation, InboxViewId, RiskLevel } from "@/lib/inbox/types";
import {
  readStoredBoolean,
  readStoredNumber,
  UI_STORAGE_KEYS,
  writeStoredBoolean,
  writeStoredNumber,
} from "@/lib/ui/persistent-state";
import {
  clampQueueWidth,
  QUEUE_DEFAULT_WIDTH,
  QUEUE_MAX_WIDTH,
  QUEUE_MIN_WIDTH,
  resizeQueueWidth,
  shouldAutoCollapseQueue,
  shouldShowOpenQueue,
} from "@/lib/inbox/layout";

type InboxLayoutClientProps = {
  allConversations: InboxConversation[];
  filtered: InboxConversation[];
  selected: InboxConversation | null;
  activeView: InboxViewId;
  searchQuery: string;
  viewCounts: Record<InboxViewId, number>;
  intentColors: Record<string, string>;
  baseDir: string;
  isDemo: boolean;
  canCreateManualConversation: boolean;
};

const riskDot: Record<RiskLevel, string> = {
  green: "status-dot-green",
  yellow: "status-dot-yellow",
  red: "status-dot-red",
};

const classificationLabel: Record<NonNullable<InboxConversation["emailClassification"]>, string> = {
  human_customer: "Customer",
  system_notification: "System",
  auth_email: "Auth",
  newsletter: "Newsletter",
  unknown: "Unknown",
};

export function InboxLayoutClient({
  allConversations,
  filtered,
  selected,
  activeView,
  searchQuery,
  viewCounts,
  intentColors,
  baseDir,
  isDemo,
  canCreateManualConversation,
}: InboxLayoutClientProps) {
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [queueWidth, setQueueWidth] = useState(QUEUE_DEFAULT_WIDTH);
  const [autoQueueCollapsed, setAutoQueueCollapsed] = useState(false);
  const [isResizingQueue, setIsResizingQueue] = useState(false);
  const [layoutHydrated, setLayoutHydrated] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(QUEUE_DEFAULT_WIDTH);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setQueueCollapsed(readStoredBoolean(window.localStorage, UI_STORAGE_KEYS.inboxQueueCollapsed, false));
      setQueueWidth(readStoredNumber(
        window.localStorage,
        UI_STORAGE_KEYS.inboxQueueWidth,
        {
          fallback: QUEUE_DEFAULT_WIDTH,
          min: QUEUE_MIN_WIDTH,
          max: QUEUE_MAX_WIDTH,
        },
      ));
      setLayoutHydrated(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!layoutHydrated) return;
    writeStoredBoolean(window.localStorage, UI_STORAGE_KEYS.inboxQueueCollapsed, queueCollapsed);
  }, [layoutHydrated, queueCollapsed]);

  useEffect(() => {
    if (!layoutHydrated) return;
    writeStoredNumber(window.localStorage, UI_STORAGE_KEYS.inboxQueueWidth, queueWidth);
  }, [layoutHydrated, queueWidth]);

  useEffect(() => {
    const syncAutoCollapse = () => {
      setAutoQueueCollapsed(shouldAutoCollapseQueue(window.innerWidth, queueWidth));
    };

    syncAutoCollapse();
    window.addEventListener("resize", syncAutoCollapse);
    return () => window.removeEventListener("resize", syncAutoCollapse);
  }, [queueWidth]);

  const displayedQueueCollapsed = queueCollapsed || autoQueueCollapsed;
  const hiddenAutomatedCount = allConversations.filter((conversation) => !isDefaultOperationalConversation(conversation)).length;
  const selectedWithContext = selected ? {
    ...selected,
    previousConversationCount: selected.contactId
      ? allConversations.filter((conversation) => conversation.contactId === selected.contactId && conversation.id !== selected.id).length
      : 0,
  } satisfies InboxConversation : null;
  const manualConversationControl = canCreateManualConversation ? <NewConversationButton /> : null;

  const buildInboxHref = (viewId: InboxViewId, conversationId?: string) => {
    const params = new URLSearchParams({ view: viewId });
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    const path = conversationId ? `${baseDir}/inbox/${conversationId}` : `${baseDir}/inbox`;
    return `${path}?${params.toString()}`;
  };

  const startQueueResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsResizingQueue(true);
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = queueWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setQueueWidth(clampQueueWidth(resizeStartWidthRef.current + moveEvent.clientX - resizeStartXRef.current));
    };

    const handlePointerUp = () => {
      setIsResizingQueue(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleQueueResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setQueueWidth((currentWidth) => resizeQueueWidth(
      currentWidth,
      event.key === "ArrowRight" ? "increase" : "decrease",
    ));
  };

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      {displayedQueueCollapsed ? (
        <aside aria-label="Collapsed conversation list" className="flex h-full w-[54px] shrink-0 flex-col items-center border-r border-[var(--line)] bg-[var(--panel)] px-2 py-3">
          {shouldShowOpenQueue(queueCollapsed) && !autoQueueCollapsed ? (
            <button
              type="button"
              onClick={() => setQueueCollapsed(false)}
              aria-label="Open queue"
              className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-3 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[var(--moss)]"
              style={{ writingMode: "vertical-rl" }}
              title="Open queue"
            >
              Open queue
            </button>
          ) : (
            <div
              className="rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-3 text-xs font-medium text-[var(--muted)]"
              style={{ writingMode: "vertical-rl" }}
              title="Queue is hidden to preserve thread space."
            >
              Queue hidden
            </div>
          )}
        </aside>
      ) : (
        <aside
          aria-label="Conversation list"
          className="flex h-full min-w-0 shrink-0 flex-col border-r border-[var(--line)] bg-[rgba(255,255,255,0.015)]"
          style={{
            width: queueWidth,
            minWidth: QUEUE_MIN_WIDTH,
            maxWidth: QUEUE_MAX_WIDTH,
          }}
        >
          <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow text-[9px] text-[var(--muted)]">Queue</p>
                <h2 className="mt-1 text-base font-semibold">Conversations</h2>
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                <span className="rounded-full bg-[var(--sage)] px-2.5 py-1 text-[11px] font-medium">
                  {filtered.length} {activeView === "all" ? "active" : "filtered"}
                </span>
                {activeView === "all" && hiddenAutomatedCount > 0 && (
                  <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)]" title="Automated/system mail is available in its own filter.">
                    {hiddenAutomatedCount} automated hidden
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setQueueCollapsed(true)}
                  aria-label="Collapse queue"
                  className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--moss)] hover:text-[var(--foreground)]"
                  title="Collapse queue"
                >
                  Collapse
                </button>
                {manualConversationControl}
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              The default queue prioritizes customer and unknown Gmail conversations. Automated mail stays available in its own filter.
            </p>
            <div className="mt-3 flex flex-col gap-0.5">
              {inboxViews.map((view) => {
                const isActive = view.id === activeView;
                return (
                  <Link
                    key={view.id}
                    href={buildInboxHref(view.id)}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-[var(--sage)] text-[var(--foreground)]"
                        : "text-[var(--muted)] hover:bg-[var(--sage)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <span>{view.label}</span>
                    <span className="text-xs">{viewCounts[view.id]}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 border-b border-[var(--line)] px-3 py-3">
            <form role="search" aria-label="Search conversations" action={`${baseDir}/inbox`} method="get">
              <input type="hidden" name="view" value={activeView} />
              <input
                type="search"
                name="q"
                aria-label="Search conversations"
                placeholder="Search conversations..."
                defaultValue={searchQuery}
                className="w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-colors focus:border-[var(--moss)]"
              />
            </form>
            <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--muted)]">
              <span>Sorted by latest reply</span>
              <span>Customer, account, risk</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scroll-soft p-3">
            {filtered.length === 0 && (
              <div className="px-3 py-8 text-center">
                <p className="text-xs text-[var(--muted)]">
                  {activeView === "all"
                    ? allConversations.some((conversation) => !isDefaultOperationalConversation(conversation))
                      ? "No operational customer conversations match this queue. Check Automated/system for imported system emails."
                      : "No conversations yet. Import recent Gmail messages to start the AI draft flow."
                    : "No conversations match this filter."}
                </p>
                {activeView === "all" && manualConversationControl && (
                  <div className="mt-4">
                    {manualConversationControl}
                  </div>
                )}
              </div>
            )}
            {filtered.map((conversation) => {
              const isSelected = selected?.id === conversation.id;
              const classification = getConversationEmailClassification(conversation);
              return (
                <Link
                  key={conversation.id}
                  href={buildInboxHref(activeView, conversation.id)}
                  className={`block border-b px-2 py-3 transition-colors ${
                    isSelected
                      ? "rounded-[18px] border-[var(--moss)] bg-[rgba(144,50,61,0.1)]"
                      : "border-transparent hover:rounded-[18px] hover:border-[var(--line)] hover:bg-[var(--panel-strong)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {conversation.customerName}
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {conversation.companyName}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {conversation.lastSeen}
                    </span>
                  </div>

                  <p className="mt-2 truncate text-sm font-medium">
                    {conversation.subject}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                    {conversation.preview}
                  </p>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap gap-1">
                      {(() => {
                        const intentKey = conversation.intent?.trim().toLowerCase();
                        const color = intentKey ? intentColors[intentKey] : undefined;
                        return (
                          <span className="flex items-center gap-1 rounded-full bg-[var(--sage)] px-2 py-0.5 text-[10px] font-medium">
                            {color && (
                              <span
                                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            )}
                            {conversation.intent || "unclassified"}
                          </span>
                        );
                      })()}
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                        {conversationStatusLabel[conversation.status]}
                      </span>
                      {classification !== "human_customer" && (
                        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                          {classificationLabel[classification]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                      <span aria-hidden="true" className={`status-dot shrink-0 ${riskDot[conversation.riskLevel]}`} />
                      <span className="capitalize">{conversation.riskLevel} risk</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>
      )}

      {!displayedQueueCollapsed && (
        <button
          type="button"
          role="separator"
          aria-label="Resize conversation queue"
          aria-orientation="vertical"
          aria-valuemin={QUEUE_MIN_WIDTH}
          aria-valuemax={QUEUE_MAX_WIDTH}
          aria-valuenow={queueWidth}
          onPointerDown={startQueueResize}
          onKeyDown={handleQueueResizeKeyDown}
          className={`group relative z-10 h-full w-2 shrink-0 cursor-col-resize border-r border-[var(--line)] bg-transparent outline-none transition-colors hover:bg-[rgba(169,146,125,0.12)] focus-visible:bg-[rgba(144,50,61,0.16)] focus-visible:ring-2 focus-visible:ring-[var(--moss)] focus-visible:ring-offset-0 ${
            isResizingQueue ? "bg-[rgba(144,50,61,0.14)]" : ""
          }`}
          title="Resize conversation queue"
        >
          <span className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--line-strong)] opacity-70 transition-opacity group-hover:opacity-100" />
        </button>
      )}

      <div className="min-w-0 flex-1 overflow-hidden">
        {selectedWithContext ? (
          <ThreadWorkspace key={selectedWithContext.id} conversation={selectedWithContext} isDemo={isDemo} intentColors={intentColors} />
        ) : (
          <div className="flex h-full items-center justify-center px-8">
            <div className="max-w-sm rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-8 text-center">
              <p className="eyebrow text-[10px] text-[var(--muted)]">Inbox</p>
              <h2 className="mt-3 text-xl font-semibold">
                {allConversations.length === 0 ? "Inbox is empty" : "Select a conversation"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                {allConversations.length === 0
                  ? "Import recent Gmail messages to test the full AI draft, edit, and analysis flow."
                  : "Choose a thread from the list to open it in the workspace."}
              </p>
              {allConversations.length === 0 && (
                <div className="mt-5 flex flex-col items-center gap-3">
                  {manualConversationControl}
                  <Link
                    href="/settings?tab=channels"
                    className="text-xs text-[var(--muted)] underline decoration-[var(--line-strong)] underline-offset-4 transition-colors hover:text-[var(--foreground)]"
                  >
                    Connect Gmail
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
