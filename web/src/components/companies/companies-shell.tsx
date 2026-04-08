"use client";

import Link from "next/link";
import { useState } from "react";

import {
  conversationStatusLabel,
  filterCompanies,
  type CompanyRecord,
  type ContactRecord,
  type InboxConversation,
} from "@/lib/mock-data";

type CompaniesShellProps = {
  companies: CompanyRecord[];
  selectedCompany?: CompanyRecord | null;
  companyContacts?: ContactRecord[];
  companyConversations?: InboxConversation[];
  activeView?: string;
};

const companyViews = [
  { id: "all", label: "All accounts", count: 42 },
  { id: "active", label: "Active accounts", count: 30 },
  { id: "priority", label: "Priority", count: 9 },
  { id: "watch", label: "Watch list", count: 5 },
] as const;

function Phase2Modal({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-6">
        <p className="eyebrow text-[10px] text-[var(--muted)]">Coming in Phase 2</p>
        <h3 className="mt-2 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          This action will be fully functional once Supabase is connected. For now
          the data layer is read-only mock data.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function CompaniesShell({
  companies,
  selectedCompany = null,
  companyContacts = [],
  companyConversations = [],
  activeView = "all",
}: CompaniesShellProps) {
  const [modal, setModal] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const selectedCompanyId = selectedCompany?.id;
  const viewFiltered = filterCompanies(companies, activeView);
  const filteredCompanies = query.trim()
    ? viewFiltered.filter((c) =>
        [c.name, c.industry, c.accountOwner].some((field) =>
          field.toLowerCase().includes(query.toLowerCase())
        )
      )
    : viewFiltered;

  return (
    <>
      {modal && <Phase2Modal title={modal} onClose={() => setModal(null)} />}
    <div className="flex h-full overflow-hidden">
      <aside className="flex h-full w-[330px] shrink-0 flex-col border-r border-[var(--line)] bg-[rgba(255,255,255,0.015)]">
        <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow text-[9px] text-[var(--muted)]">Accounts</p>
              <h1 className="mt-1 text-base font-semibold">Companies</h1>
            </div>
            <button
              onClick={() => setModal("New account")}
              className="rounded-full bg-[var(--moss)] px-3 py-1.5 text-[11px] font-medium text-white"
            >
              New account
            </button>
          </div>

          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Lightweight account records with direct links to people, ownership, and operational load.
          </p>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies, owners, industry…"
            className="mt-3 w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
          />
        </div>

        <div className="shrink-0 border-b border-[var(--line)] px-3 py-3">
          <div className="flex flex-col gap-0.5">
            {companyViews.map((view) => {
              const isActive = view.id === activeView;
              const count = filterCompanies(companies, view.id).length;
              return (
                <Link
                  key={view.id}
                  href={view.id === "all" ? "/companies" : `/companies?view=${view.id}`}
                  className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-[var(--sage)] text-[var(--foreground)]"
                      : "text-[var(--muted)] hover:bg-[var(--sage)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <span>{view.label}</span>
                  <span className="text-xs">{count}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="scroll-soft flex-1 overflow-y-auto p-3">
          {filteredCompanies.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">
              No companies match this filter.
            </p>
          )}
          {filteredCompanies.map((company) => {
            const isSelected = company.id === selectedCompanyId;
            const viewParam = activeView !== "all" ? `?view=${activeView}` : "";

            return (
              <Link
                key={company.id}
                href={`/companies/${company.id}${viewParam}`}
                className={`block border-b px-2 py-3 transition-colors ${
                  isSelected
                    ? "rounded-[18px] border-[var(--moss)] bg-[rgba(144,50,61,0.11)]"
                    : "border-transparent hover:rounded-[18px] hover:border-[var(--line)] hover:bg-[var(--panel-strong)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{company.name}</p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {company.industry}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--sage)] px-2 py-0.5 text-[10px]">
                    {company.openConversations} open
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--muted)]">
                  <div>
                    <p>Owner</p>
                    <p className="mt-1 text-[var(--foreground)]">{company.accountOwner}</p>
                  </div>
                  <div>
                    <p>Contacts</p>
                    <p className="mt-1 text-[var(--foreground)]">{company.activeContacts}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedCompany ? (
          <>
            <div className="shrink-0 border-b border-[var(--line)] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow text-[10px] text-[var(--muted)]">Account record</p>
                  <h2 className="mt-1 text-xl font-semibold">{selectedCompany.name}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span>{selectedCompany.industry}</span>
                    <span>•</span>
                    <span>Owner: {selectedCompany.accountOwner}</span>
                    <span>•</span>
                    <span>{selectedCompany.openConversations} open conversations</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setModal("Edit account")}
                    className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium"
                  >
                    Edit account
                  </button>
                  <button
                    onClick={() => setModal("Add contact")}
                    className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white"
                  >
                    Add contact
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="surface-subtle rounded-[16px] px-4 py-3">
                  <p className="text-[10px] text-[var(--muted)]">Owner</p>
                  <p className="mt-1 text-sm font-medium">{selectedCompany.accountOwner}</p>
                </div>
                <div className="surface-subtle rounded-[16px] px-4 py-3">
                  <p className="text-[10px] text-[var(--muted)]">Industry</p>
                  <p className="mt-1 text-sm font-medium">{selectedCompany.industry}</p>
                </div>
                <div className="surface-subtle rounded-[16px] px-4 py-3">
                  <p className="text-[10px] text-[var(--muted)]">Active contacts</p>
                  <p className="mt-1 text-sm font-medium">{selectedCompany.activeContacts}</p>
                </div>
                <div className="surface-subtle rounded-[16px] px-4 py-3">
                  <p className="text-[10px] text-[var(--muted)]">Open load</p>
                  <p className="mt-1 text-sm font-medium">{selectedCompany.openConversations} threads</p>
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="scroll-soft overflow-y-auto px-5 py-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Account summary</p>
                    <div className="mt-3 grid gap-3 text-sm">
                      <div>
                        <p className="text-[var(--muted)]">Industry</p>
                        <p>{selectedCompany.industry}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted)]">Account owner</p>
                        <p>{selectedCompany.accountOwner}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted)]">Active contacts</p>
                        <p>{selectedCompany.activeContacts}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted)]">Open conversations</p>
                        <p>{selectedCompany.openConversations}</p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Connected people</p>
                    <div className="mt-3 space-y-3">
                      {companyContacts.map((contact) => (
                        <Link
                          key={contact.id}
                          href={`/contacts/${contact.id}`}
                          className="block rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-3 transition-colors hover:border-[var(--line-strong)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{contact.fullName}</p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {contact.email}
                              </p>
                            </div>
                            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px]">
                              {contact.status}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4 lg:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="eyebrow text-[9px] text-[var(--muted)]">
                        Company-wide conversation history
                      </p>
                      <Link href="/inbox" className="text-xs text-[var(--moss)]">
                        Open inbox
                      </Link>
                    </div>

                    <div className="mt-3 space-y-3">
                      {companyConversations.map((conversation) => (
                        <Link
                          key={conversation.id}
                          href={`/inbox/${conversation.id}`}
                          className="block rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-4 transition-colors hover:border-[var(--line-strong)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{conversation.subject}</p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {conversation.customerName} • {conversation.intent} • {conversation.lastSeen}
                              </p>
                            </div>
                            <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]">
                              {conversationStatusLabel[conversation.status]}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                            {conversation.preview}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </section>
                </div>
              </div>

              <aside className="scroll-soft border-l border-[var(--line)] overflow-y-auto px-4 py-4">
                <div className="space-y-4">
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Coordination notes</p>
                    <ul className="mt-3 space-y-2 text-sm leading-6">
                      <li className="flex gap-2">
                        <span className="text-[var(--muted)]">•</span>
                        <span>Keep company context visible while contacts stay people-first.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-[var(--muted)]">•</span>
                        <span>Make sure notes, tags, and ownership carry across modules.</span>
                      </li>
                    </ul>
                  </section>

                  <section className="rounded-[20px] border border-[rgba(144,50,61,0.3)] bg-[rgba(73,17,28,0.18)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--amber)]">Account pressure points</p>
                    <ul className="mt-3 space-y-2 text-sm leading-6">
                      <li className="flex gap-2">
                        <span className="text-[var(--muted)]">•</span>
                        <span>{selectedCompany.openConversations} open threads need unified context.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-[var(--muted)]">•</span>
                        <span>{selectedCompany.activeContacts} active contacts should stay aligned on the same account state.</span>
                      </li>
                    </ul>
                  </section>

                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Module links</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href="/contacts"
                        className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[10px]"
                      >
                        Contacts
                      </Link>
                      <Link
                        href="/inbox"
                        className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[10px]"
                      >
                        Inbox
                      </Link>
                      <Link
                        href="/dashboard"
                        className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[10px]"
                      >
                        Dashboard
                      </Link>
                    </div>
                  </section>
                </div>
              </aside>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-8">
            <div className="max-w-xl rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-8 text-center">
              <p className="eyebrow text-[10px] text-[var(--muted)]">Companies module</p>
              <h2 className="mt-3 text-2xl font-semibold">
                Choose an account to open its shared workspace
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Companies stay lightweight in V1, but they now connect directly to
                contacts and conversation load so information carries across modules.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
