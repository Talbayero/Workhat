import Link from "next/link";
import { notFound } from "next/navigation";

import {
  conversations,
  getConversationById,
  inboxViews,
  type InboxConversation,
  type RiskLevel,
} from "@/lib/mock-data";
import { ThreadWorkspace } from "./thread-workspace";

type InboxWorkspaceProps = {
  selectedConversationId?: string;
};

const riskDot: Record<RiskLevel, string> = {
  green: "status-dot-green",
  yellow: "status-dot-yellow",
  red: "status-dot-red",
};

function getSelected(id?: string): InboxConversation {
  if (!id) return conversations[0];
  const c = getConversationById(id);
  if (!c) notFound();
  return c;
}

export function InboxWorkspace({ selectedConversationId }: InboxWorkspaceProps) {
  const selected = getSelected(selectedConversationId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Conversation list ── */}
      <aside className="flex h-full w-[290px] shrink-0 flex-col border-r border-[var(--line)]">
        {/* List header */}
        <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold">Inbox</h1>
            <span className="rounded-full bg-[var(--sage)] px-2.5 py-1 text-[11px] font-medium">
              42 open
            </span>
          </div>

          {/* View filters */}
          <div className="mt-3 flex flex-col gap-0.5">
            {inboxViews.map((view) => (
              <div
                key={view.id}
                className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--sage)] hover:text-[var(--foreground)]"
              >
                <span>{view.label}</span>
                <span className="text-xs">{view.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation rows */}
        <div className="flex-1 overflow-y-auto scroll-soft space-y-2 p-3">
          {conversations.map((conversation) => {
            const isSelected = selected.id === conversation.id;
            return (
              <Link
                key={conversation.id}
                href={`/inbox/${conversation.id}`}
                className={`block rounded-[20px] border p-3.5 transition-colors ${
                  isSelected
                    ? "border-[var(--moss)] bg-[rgba(144,50,61,0.11)]"
                    : "border-[var(--line)] bg-[var(--panel-strong)] hover:border-[var(--line-strong)]"
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

                <p className="mt-2 truncate text-xs font-medium">
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
                    {conversation.tags.slice(0, 1).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span
                    className={`status-dot shrink-0 ${riskDot[conversation.riskLevel]}`}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </aside>

      {/* ── Thread workspace (client component handles slide-in panels) ── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <ThreadWorkspace conversation={selected} />
      </div>
    </div>
  );
}
