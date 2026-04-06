"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useState } from "react";

import {
  contactFilters,
  contacts,
  contactsListViews,
  conversationStatusLabel,
  filterContacts,
  getCompanyById,
  getContactById,
  getConversationsForContact,
  type ContactRecord,
} from "@/lib/mock-data";

type ContactsShellProps = {
  selectedContactId?: string;
  activeView?: string;
};

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

function getSelectedContact(selectedContactId?: string): ContactRecord | null {
  if (!selectedContactId) {
    return null;
  }

  const contact = getContactById(selectedContactId);

  if (!contact) {
    notFound();
  }

  return contact;
}

function ContactStatusPill({ status }: { status: ContactRecord["status"] }) {
  const styles = {
    vip: "bg-[rgba(144,50,61,0.18)] text-[var(--foreground)] border border-[rgba(144,50,61,0.35)]",
    watch:
      "bg-[rgba(169,146,125,0.12)] text-[var(--foreground)] border border-[rgba(169,146,125,0.24)]",
    active:
      "bg-[var(--sage)] text-[var(--foreground)] border border-[var(--line)]",
  } as const;

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function ContactsShell({ selectedContactId, activeView = "all" }: ContactsShellProps) {
  const [modal, setModal] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const viewFiltered = filterContacts(contacts, activeView);
  const filteredContacts = query.trim()
    ? viewFiltered.filter((c) =>
        [c.fullName, c.companyName, c.email, ...c.tags].some((field) =>
          field.toLowerCase().includes(query.toLowerCase())
        )
      )
    : viewFiltered;
  const selectedContact = getSelectedContact(selectedContactId);
  const company = selectedContact ? getCompanyById(selectedContact.companyId) : null;
  const linkedConversations = selectedContact
    ? getConversationsForContact(selectedContact.id)
    : [];

  return (
    <>
      {modal && <Phase2Modal title={modal} onClose={() => setModal(null)} />}
    <div className="flex h-full overflow-hidden">
      <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-[var(--line)]">
        <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold">Contacts</h1>
            <button
              onClick={() => setModal("New contact")}
              className="rounded-full bg-[var(--moss)] px-3 py-1.5 text-[11px] font-medium text-white"
            >
              New contact
            </button>
          </div>

          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            People-first records with companies linked in, not buried in a
            separate module.
          </p>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts, companies, tags, owner…"
            className="mt-3 w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
          />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {contactFilters.slice(0, 6).map((filter) => (
              <span
                key={filter}
                className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] text-[var(--muted)]"
              >
                {filter}
              </span>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-b border-[var(--line)] px-3 py-3">
          <div className="flex flex-col gap-0.5">
            {contactsListViews.map((view) => {
              const isActive = view.id === activeView;
              const count = filterContacts(contacts, view.id).length;
              return (
                <Link
                  key={view.id}
                  href={view.id === "all" ? "/contacts" : `/contacts?view=${view.id}`}
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

        <div className="scroll-soft flex-1 space-y-2 overflow-y-auto p-3">
          {filteredContacts.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">
              No contacts match this filter.
            </p>
          )}
          {filteredContacts.map((contact) => {
            const isSelected = contact.id === selectedContactId;
            const viewParam = activeView !== "all" ? `?view=${activeView}` : "";

            return (
              <Link
                key={contact.id}
                href={`/contacts/${contact.id}${viewParam}`}
                className={`block rounded-[20px] border p-3.5 transition-colors ${
                  isSelected
                    ? "border-[var(--moss)] bg-[rgba(144,50,61,0.11)]"
                    : "border-[var(--line)] bg-[var(--panel-strong)] hover:border-[var(--line-strong)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{contact.fullName}</p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {contact.companyName}
                    </p>
                  </div>
                  <ContactStatusPill status={contact.status} />
                </div>

                <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                  <p className="truncate">{contact.email}</p>
                  <p>{contact.lastActivity}</p>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {contact.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-[var(--muted)]">
                    {contact.openConversationCount} open
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedContact ? (
          <>
            <div className="shrink-0 border-b border-[var(--line)] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow text-[10px] text-[var(--muted)]">
                    Contact record
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {selectedContact.fullName}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span>{selectedContact.email}</span>
                    <span>•</span>
                    <span>{selectedContact.phone}</span>
                    <span>•</span>
                    <span>Owner: {selectedContact.owner}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setModal("Edit contact info")}
                    className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium"
                  >
                    Edit info
                  </button>
                  <Link
                    href="/inbox"
                    className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white"
                  >
                    Create conversation
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="scroll-soft overflow-y-auto px-5 py-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Identity</p>
                    <div className="mt-3 grid gap-3 text-sm">
                      <div>
                        <p className="text-[var(--muted)]">First name</p>
                        <p>{selectedContact.firstName}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted)]">Last name</p>
                        <p>{selectedContact.lastName}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted)]">Preferred channel</p>
                        <p>{selectedContact.editableFields.preferredChannel}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted)]">Lifecycle stage</p>
                        <p>{selectedContact.editableFields.lifecycleStage}</p>
                      </div>
                      <div>
                        <p className="text-[var(--muted)]">Location</p>
                        <p>{selectedContact.editableFields.location}</p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">
                      Connected account
                    </p>
                    {company ? (
                      <div className="mt-3 space-y-3 text-sm">
                        <div>
                          <Link
                            href={`/companies/${company.id}`}
                            className="font-medium transition-colors hover:text-[var(--moss)]"
                          >
                            {company.name}
                          </Link>
                          <p className="text-[var(--muted)]">{company.industry}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[var(--muted)]">Account owner</p>
                            <p>{company.accountOwner}</p>
                          </div>
                          <div>
                            <p className="text-[var(--muted)]">Active contacts</p>
                            <p>{company.activeContacts}</p>
                          </div>
                          <div>
                            <p className="text-[var(--muted)]">Open conversations</p>
                            <p>{company.openConversations}</p>
                          </div>
                          <div>
                            <p className="text-[var(--muted)]">Tier</p>
                            <p>{selectedContact.tier}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4 lg:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="eyebrow text-[9px] text-[var(--muted)]">
                        Conversation history
                      </p>
                      <Link href="/inbox" className="text-xs text-[var(--moss)]">
                        Open inbox
                      </Link>
                    </div>

                    {company ? (
                      <div className="mt-2">
                        <Link
                          href={`/companies/${company.id}`}
                          className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                        >
                          Open company record
                        </Link>
                      </div>
                    ) : null}

                    <div className="mt-3 space-y-3">
                      {linkedConversations.map((conversation) => (
                        <Link
                          key={conversation.id}
                          href={`/inbox/${conversation.id}`}
                          className="block rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-4 transition-colors hover:border-[var(--line-strong)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{conversation.subject}</p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {conversation.intent} • {conversation.lastSeen}
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
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Notes</p>
                    <ul className="mt-3 space-y-2 text-sm leading-6">
                      {selectedContact.notes.map((note) => (
                        <li key={note} className="flex gap-2">
                          <span className="text-[var(--muted)]">•</span>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="rounded-[20px] border border-[rgba(144,50,61,0.3)] bg-[rgba(73,17,28,0.18)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--amber)]">Open issues</p>
                    <ul className="mt-3 space-y-2 text-sm leading-6">
                      {selectedContact.openIssues.length > 0 ? (
                        selectedContact.openIssues.map((issue) => (
                          <li key={issue} className="flex gap-2">
                            <span className="text-[var(--muted)]">•</span>
                            <span>{issue}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-[var(--muted)]">No open issues right now.</li>
                      )}
                    </ul>
                  </section>

                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Tags + state</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ContactStatusPill status={selectedContact.status} />
                      {selectedContact.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 text-sm text-[var(--muted)]">
                      Last activity: {selectedContact.lastActivity}
                    </div>
                  </section>

                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Connectivity</p>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                      This module intentionally links people, companies, notes,
                      owners, tags, and live conversation routes so information
                      carries through the rest of the product.
                    </p>
                  </section>
                </div>
              </aside>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-8">
            <div className="max-w-xl rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-8 text-center">
              <p className="eyebrow text-[10px] text-[var(--muted)]">Contacts module</p>
              <h2 className="mt-3 text-2xl font-semibold">
                Choose a contact to open their record
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                V1 keeps contacts people-first, but still connected to companies,
                owners, notes, and conversation history so the module stays operational.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
