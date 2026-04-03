import Link from "next/link";
import { notFound } from "next/navigation";

import {
  conversations,
  getConversationById,
  inboxViews,
  insightCards,
  type InboxConversation,
  type RiskLevel,
} from "@/lib/mock-data";

type InboxWorkspaceProps = {
  selectedConversationId?: string;
};

const riskTone: Record<RiskLevel, string> = {
  green: "status-dot-green text-[var(--moss)]",
  yellow: "status-dot-yellow text-[var(--amber)]",
  red: "status-dot-red text-[var(--rose)]",
};

function getSelectedConversation(
  selectedConversationId?: string,
): InboxConversation {
  if (!selectedConversationId) {
    return conversations[0];
  }

  const conversation = getConversationById(selectedConversationId);

  if (!conversation) {
    notFound();
  }

  return conversation;
}

export function InboxWorkspace({
  selectedConversationId,
}: InboxWorkspaceProps) {
  const selected = getSelectedConversation(selectedConversationId);

  return (
    <div className="min-h-screen text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-4 p-4 lg:p-6">
        <aside className="grain-panel hidden w-[250px] shrink-0 rounded-[28px] border border-[var(--line)] p-5 lg:flex lg:flex-col">
          <div className="border-b border-[var(--line)] pb-5">
            <p className="eyebrow text-xs text-[var(--muted)]">Work Hat CRM</p>
            <h1 className="mt-3 text-2xl font-semibold leading-tight">
              Support OS
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              AI-operated inbox for teams that want measurable improvement, not
              mystery automation.
            </p>
          </div>

          <nav className="mt-5 flex flex-col gap-2">
            {[
              { href: "/inbox", label: "Inbox", active: true },
              { href: "/dashboard", label: "Dashboard", active: false },
              { href: "/onboarding", label: "Onboarding", active: false },
              { href: "/login", label: "Login", active: false },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-2xl px-4 py-3 text-sm transition ${
                  item.active
                    ? "bg-[var(--moss)] text-white"
                    : "text-[var(--foreground)] hover:bg-[rgba(169,146,125,0.08)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-8">
            <p className="eyebrow text-xs text-[var(--muted)]">Views</p>
            <div className="mt-3 flex flex-col gap-2">
              {inboxViews.map((view) => (
                <div
                  key={view.id}
                  className="flex items-center justify-between rounded-2xl border border-[var(--line)] px-4 py-3"
                >
                  <span className="text-sm">{view.label}</span>
                  <span className="rounded-full bg-[var(--sage)] px-2.5 py-1 text-xs font-medium text-[var(--moss-strong)]">
                    {view.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto rounded-[24px] bg-[var(--moss-strong)] p-4 text-white">
            <p className="eyebrow text-xs text-white/70">Launch posture</p>
            <p className="mt-3 text-lg font-semibold">Email-first, human-approved.</p>
            <p className="mt-2 text-sm leading-6 text-white/75">
              Built for `work-hat.com`, with channel abstraction ready for SMS
              once the inbox is stable.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="grain-panel rounded-[28px] border border-[var(--line)] px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="eyebrow text-xs text-[var(--muted)]">
                  Work Hat / Inbox
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                  Conversation-first command center
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                  This first build pass is the Milestone 1 shell: inbox views,
                  active thread workspace, AI guidance panel, and the reporting
                  posture that makes AI improvement measurable.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {insightCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-[22px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3"
                  >
                    <p className="text-sm text-[var(--muted)]">{card.label}</p>
                    <p className="mt-2 text-xl font-semibold">{card.value}</p>
                    <p className="mt-1 text-xs text-[var(--moss)]">{card.delta}</p>
                  </div>
                ))}
              </div>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_320px]">
            <section className="grain-panel rounded-[28px] border border-[var(--line)]">
              <div className="border-b border-[var(--line)] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="eyebrow text-xs text-[var(--muted)]">
                      Active queue
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">Inbox</h3>
                  </div>
                  <div className="rounded-full bg-[var(--sage)] px-3 py-1 text-xs font-medium text-[var(--moss-strong)]">
                    42 open
                  </div>
                </div>
              </div>

              <div className="scroll-soft flex max-h-[calc(100vh-280px)] flex-col gap-3 overflow-y-auto p-4">
                {conversations.map((conversation) => {
                  const isSelected = selected.id === conversation.id;

                  return (
                    <Link
                      key={conversation.id}
                      href={`/inbox/${conversation.id}`}
                      className={`rounded-[24px] border p-4 transition ${
                        isSelected
                          ? "border-[var(--moss)] bg-[rgba(144,50,61,0.16)]"
                          : "border-[var(--line)] bg-[var(--panel-strong)] hover:border-[var(--line-strong)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{conversation.customerName}</p>
                          <p className="mt-1 text-sm text-[var(--muted)]">
                            {conversation.companyName}
                          </p>
                        </div>
                        <span className="text-xs text-[var(--muted)]">
                          {conversation.lastSeen}
                        </span>
                      </div>

                      <p className="mt-4 text-sm font-medium">{conversation.subject}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        {conversation.preview}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--sage)] px-2.5 py-1 text-xs font-medium text-[var(--moss-strong)]">
                          {conversation.intent}
                        </span>
                        {conversation.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
                        <span className="flex items-center gap-2">
                          <span
                            className={`status-dot ${riskTone[conversation.riskLevel]}`}
                          />
                          Risk {conversation.riskLevel}
                        </span>
                        <span>Owner: {conversation.assignee}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="grain-panel rounded-[28px] border border-[var(--line)]">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
                <div>
                  <p className="eyebrow text-xs text-[var(--muted)]">
                    {selected.companyName}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">
                    {selected.subject}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-[var(--sage)] px-3 py-1 text-xs font-medium text-[var(--moss-strong)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-start gap-2 rounded-[22px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm">
                  <span className="text-[var(--muted)]">AI confidence</span>
                  <span className="flex items-center gap-2 font-medium capitalize">
                    <span
                      className={`status-dot ${riskTone[selected.aiConfidence]}`}
                    />
                    {selected.aiConfidence}
                  </span>
                </div>
              </div>

              <div className="scroll-soft flex max-h-[calc(100vh-280px)] flex-col overflow-y-auto px-5 py-5">
                <div className="space-y-4">
                  {selected.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`rounded-[24px] border px-4 py-4 ${
                        message.senderType === "customer"
                          ? "border-[var(--line)] bg-[var(--panel-strong)]"
                          : message.senderType === "ai"
                            ? "border-[rgba(169,146,125,0.28)] bg-[rgba(169,146,125,0.08)]"
                            : "border-[rgba(94,80,63,0.35)] bg-[rgba(94,80,63,0.12)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{message.sender}</p>
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                            {message.senderType}
                          </p>
                        </div>
                        <span className="text-xs text-[var(--muted)]">
                          {message.timestamp}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-7">{message.body}</p>
                    </article>
                  ))}
                </div>

                <div className="mt-5 rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="eyebrow text-xs text-[var(--muted)]">
                        Reply workspace
                      </p>
                      <h4 className="mt-2 text-xl font-semibold">
                        Human-approved AI draft
                      </h4>
                    </div>
                    <div className="rounded-full bg-[var(--moss)] px-3 py-1 text-xs font-medium text-white">
                      Draft only, no auto-send
                    </div>
                  </div>

                  <textarea
                    readOnly
                    value={selected.aiDraft.draftText}
                    className="mt-4 min-h-52 w-full rounded-[24px] border border-[var(--line)] bg-[rgba(10,9,8,0.86)] px-4 py-4 text-sm leading-7 text-[var(--foreground)] outline-none"
                  />

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="rounded-full bg-[var(--moss)] px-5 py-3 text-sm font-medium text-white">
                      Generate new draft
                    </button>
                    <button className="rounded-full border border-[var(--line-strong)] px-5 py-3 text-sm font-medium">
                      Compare after send
                    </button>
                    <button className="rounded-full border border-[var(--line-strong)] px-5 py-3 text-sm font-medium">
                      Save internal note
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="grain-panel rounded-[28px] border border-[var(--line)] p-5">
              <div>
                <p className="eyebrow text-xs text-[var(--muted)]">
                  AI guidance
                </p>
                <h3 className="mt-2 text-xl font-semibold">
                  Why this draft looks the way it does
                </h3>
              </div>

              <div className="mt-5 rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                <p className="text-sm font-medium text-[var(--muted)]">
                  Reasoning
                </p>
                <p className="mt-2 text-sm leading-7">{selected.aiDraft.rationale}</p>
              </div>

              <div className="mt-4 rounded-[24px] border border-[rgba(169,146,125,0.26)] bg-[rgba(94,80,63,0.16)] p-4">
                <p className="text-sm font-medium text-[var(--amber)]">
                  Missing context
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--foreground)]">
                  {selected.aiDraft.missingContext.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                <p className="text-sm font-medium text-[var(--muted)]">
                  Suggested improvements
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6">
                  {selected.aiDraft.suggestions.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 border-t border-[var(--line)] pt-6">
                <p className="eyebrow text-xs text-[var(--muted)]">
                  Customer profile
                </p>
                <h4 className="mt-2 text-lg font-semibold">
                  {selected.customerName}
                </h4>
                <div className="mt-4 space-y-3 text-sm">
                  <div>
                    <p className="text-[var(--muted)]">Email</p>
                    <p>{selected.profile.email}</p>
                  </div>
                  <div>
                    <p className="text-[var(--muted)]">Phone</p>
                    <p>{selected.profile.phone}</p>
                  </div>
                  <div>
                    <p className="text-[var(--muted)]">Tier</p>
                    <p>{selected.profile.tier}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm font-medium text-[var(--muted)]">Notes</p>
                  <ul className="mt-2 space-y-2 text-sm leading-6">
                    {selected.profile.notes.map((note) => (
                      <li key={note}>• {note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
