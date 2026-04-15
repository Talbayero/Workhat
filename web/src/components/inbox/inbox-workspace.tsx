import Link from "next/link";
import { notFound } from "next/navigation";

import {
  conversationStatusLabel,
  filterConversations,
  inboxViews,
  type InboxConversation,
  type InboxViewId,
  type RiskLevel,
} from "@/lib/mock-data";
import { getConversations, getConversationById } from "@/lib/supabase/queries";
import { ThreadWorkspace } from "./thread-workspace";
import { NewConversationButton } from "./new-conversation-button";

type InboxWorkspaceProps = {
  selectedConversationId?: string;
  activeView?: InboxViewId;
};

const riskDot: Record<RiskLevel, string> = {
  green: "status-dot-green",
  yellow: "status-dot-yellow",
  red: "status-dot-red",
};

export async function InboxWorkspace({
  selectedConversationId,
  activeView = "all",
}: InboxWorkspaceProps) {
  // Fetch all conversations for sidebar list + view counts
  const allConversations = await getConversations();
  const filtered = filterConversations(allConversations, activeView);

  // Determine which conversation to show in the thread pane
  const targetId = selectedConversationId ?? filtered[0]?.id;
  let selected: InboxConversation | null = null;

  if (targetId) {
    selected = await getConversationById(targetId);
    if (selectedConversationId && !selected) notFound();
    // Fall back to first in list without messages if fetch failed
    if (!selected) selected = filtered[0] ?? null;
  }

  // Compute real counts from actual data
  const viewCounts = Object.fromEntries(
    inboxViews.map((v) => [v.id, filterConversations(allConversations, v.id).length])
  ) as Record<InboxViewId, number>;

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-[var(--line)] bg-[rgba(255,255,255,0.015)]">
        <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow text-[9px] text-[var(--muted)]">Queue</p>
              <h2 className="mt-1 text-base font-semibold">Conversations</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--sage)] px-2.5 py-1 text-[11px] font-medium">
                {filtered.length} {activeView === "all" ? "open" : "filtered"}
              </span>
              <NewConversationButton />
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Keep the queue compact, scan risk quickly, and open the next thread without losing context.
          </p>

          <div className="mt-3 flex flex-col gap-0.5">
            {inboxViews.map((view) => {
              const isActive = view.id === activeView;
              return (
                <Link
                  key={view.id}
                  href={`/inbox?view=${view.id}`}
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
          <input
            type="search"
            placeholder="Search conversations…"
            className="w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
          />
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
                  ? "No conversations yet. Create one to test the AI draft flow."
                  : "No conversations match this filter."}
              </p>
              {activeView === "all" && (
                <div className="mt-4">
                  <NewConversationButton />
                </div>
              )}
            </div>
          )}
          {filtered.map((conversation) => {
            const isSelected = selected?.id === conversation.id;
            return (
              <Link
                key={conversation.id}
                href={`/inbox/${conversation.id}?view=${activeView}`}
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
                    <span className="rounded-full bg-[var(--sage)] px-2 py-0.5 text-[10px] font-medium">
                      {conversation.intent}
                    </span>
                    <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                      {conversationStatusLabel[conversation.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                    <span className={`status-dot shrink-0 ${riskDot[conversation.riskLevel]}`} />
                    <span className="capitalize">{conversation.riskLevel}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-hidden">
        {selected ? (
          <ThreadWorkspace key={selected.id} conversation={selected} />
        ) : (
          <div className="flex h-full items-center justify-center px-8">
            <div className="max-w-sm rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-8 text-center">
              <p className="eyebrow text-[10px] text-[var(--muted)]">Inbox</p>
              <h2 className="mt-3 text-xl font-semibold">
                {allConversations.length === 0 ? "Inbox is empty" : "Select a conversation"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                {allConversations.length === 0
                  ? "Create a conversation to test the full AI draft → edit → analysis flow, or set up your inbound email channel to receive real messages."
                  : "Choose a thread from the list to open it in the workspace."}
              </p>
              {allConversations.length === 0 && (
                <div className="mt-5 flex flex-col items-center gap-3">
                  <NewConversationButton />
                  <Link
                    href="/settings"
                    className="text-xs text-[var(--muted)] underline underline-offset-4 decoration-[var(--line-strong)] transition-colors hover:text-[var(--foreground)]"
                  >
                    Set up inbound email →
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
