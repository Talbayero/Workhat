"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  contactsListViews,
  conversationStatusLabel,
  filterContacts,
  type ContactRecord,
  type CompanyRecord,
  type InboxConversation,
} from "@/lib/mock-data";

type ContactsShellProps = {
  contacts: ContactRecord[];
  selectedContact?: ContactRecord | null;
  company?: CompanyRecord | null;
  linkedConversations?: InboxConversation[];
  activeView?: string;
  isDemo?: boolean;
  baseDir?: string;
};

// ── Status pill ───────────────────────────────────────────────────────────────

function ContactStatusPill({ status }: { status: ContactRecord["status"] }) {
  const styles = {
    vip:    "bg-[rgba(144,50,61,0.18)] text-[var(--foreground)] border border-[rgba(144,50,61,0.35)]",
    watch:  "bg-[rgba(169,146,125,0.12)] text-[var(--foreground)] border border-[rgba(169,146,125,0.24)]",
    active: "bg-[var(--sage)] text-[var(--foreground)] border border-[var(--line)]",
  } as const;
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

// ── Create contact modal ───────────────────────────────────────────────────────

function CreateContactModal({ onClose, onSaved, isDemo = false }: { onClose: () => void; onSaved: () => void; isDemo?: boolean }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", notes: "", tags: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() && !form.email.trim()) {
      setError("First name or email is required.");
      return;
    }
    setSaving(true);
    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      setSaving(false);
      onSaved();
      return;
    }
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json() as { error?: string };
      setError(data.error ?? "Something went wrong.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="grain-panel w-full max-w-lg rounded-[28px] border border-[var(--line)] shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
        <div className="border-b border-[var(--line)] px-6 py-5">
          <p className="eyebrow text-[10px] text-[var(--muted)]">Contacts</p>
          <h2 className="mt-1 text-lg font-semibold">New contact</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[["firstName", "First name *"], ["lastName", "Last name"]].map(([field, label]) => (
                <div key={field}>
                  <label className="eyebrow text-[10px] text-[var(--muted)]">{label}</label>
                  <input
                    value={form[field as keyof typeof form]}
                    onChange={(e) => set(field, e.target.value)}
                    className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
                  />
                </div>
              ))}
            </div>
            {[["email", "Email", "name@company.com"], ["phone", "Phone", "+1 555 000 0000"]].map(([field, label, placeholder]) => (
              <div key={field}>
                <label className="eyebrow text-[10px] text-[var(--muted)]">{label}</label>
                <input
                  type={field === "email" ? "email" : "text"}
                  value={form[field as keyof typeof form]}
                  onChange={(e) => set(field, e.target.value)}
                  placeholder={placeholder}
                  className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
                />
              </div>
            ))}
            <div>
              <label className="eyebrow text-[10px] text-[var(--muted)]">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                placeholder="Context about this contact…"
                className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors resize-none"
              />
            </div>
            <div>
              <label className="eyebrow text-[10px] text-[var(--muted)]">Tags <span className="normal-case font-normal">(comma-separated)</span></label>
              <input
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="vip, billing, enterprise"
                className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
              />
            </div>
            {error && (
              <p className="rounded-[12px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-sm">{error}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--line)] px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-full bg-[var(--moss)] px-5 py-2 text-xs font-medium text-white disabled:opacity-50">
              {saving ? "Creating…" : "Create contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit contact modal ────────────────────────────────────────────────────────

function EditContactModal({ contact, onClose, onSaved, isDemo = false }: { contact: ContactRecord; onClose: () => void; onSaved: () => void; isDemo?: boolean }) {
  const [form, setForm] = useState({
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    notes: contact.notes.join("\n"),
    tags: contact.tags.join(", "),
    lifecycleStage: contact.editableFields.lifecycleStage,
    tier: contact.tier,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      setSaving(false);
      onSaved();
      return;
    }
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        lifecycle_stage: form.lifecycleStage || null,
        tier: form.tier || null,
      }),
    });
    setSaving(false);
    if (res.ok) { onSaved(); }
    else {
      const data = await res.json() as { error?: string };
      setError(data.error ?? "Something went wrong.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="grain-panel w-full max-w-lg rounded-[28px] border border-[var(--line)] shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
        <div className="border-b border-[var(--line)] px-6 py-5">
          <p className="eyebrow text-[10px] text-[var(--muted)]">Contacts</p>
          <h2 className="mt-1 text-lg font-semibold">Edit {contact.fullName}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[["firstName", "First name"], ["lastName", "Last name"]].map(([field, label]) => (
                <div key={field}>
                  <label className="eyebrow text-[10px] text-[var(--muted)]">{label}</label>
                  <input
                    value={form[field as keyof typeof form]}
                    onChange={(e) => set(field, e.target.value)}
                    className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--moss)] transition-colors"
                  />
                </div>
              ))}
            </div>
            {[["email", "Email"], ["phone", "Phone"]].map(([field, label]) => (
              <div key={field}>
                <label className="eyebrow text-[10px] text-[var(--muted)]">{label}</label>
                <input
                  value={form[field as keyof typeof form]}
                  onChange={(e) => set(field, e.target.value)}
                  className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--moss)] transition-colors"
                />
              </div>
            ))}
            <div>
              <label className="eyebrow text-[10px] text-[var(--muted)]">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--moss)] transition-colors resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="eyebrow text-[10px] text-[var(--muted)]">Lifecycle stage</label>
                <select
                  value={form.lifecycleStage}
                  onChange={(e) => set("lifecycleStage", e.target.value)}
                  className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--moss)] transition-colors"
                >
                  <option value="">—</option>
                  <option value="lead">Lead</option>
                  <option value="prospect">Prospect</option>
                  <option value="customer">Customer</option>
                  <option value="churned">Churned</option>
                </select>
              </div>
              <div>
                <label className="eyebrow text-[10px] text-[var(--muted)]">Tier</label>
                <select
                  value={form.tier}
                  onChange={(e) => set("tier", e.target.value)}
                  className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--moss)] transition-colors"
                >
                  <option value="">—</option>
                  <option value="standard">Standard</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
            </div>
            <div>
              <label className="eyebrow text-[10px] text-[var(--muted)]">Tags</label>
              <input
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--moss)] transition-colors"
              />
            </div>
            {error && (
              <p className="rounded-[12px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-sm">{error}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--line)] px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-full bg-[var(--moss)] px-5 py-2 text-xs font-medium text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

type SortKey = "Name" | "Company" | "Last activity" | "Tags" | "Open conversations";

function sortContacts(list: ContactRecord[], key: SortKey): ContactRecord[] {
  return [...list].sort((a, b) => {
    switch (key) {
      case "Name": return a.fullName.localeCompare(b.fullName);
      case "Company": return a.companyName.localeCompare(b.companyName);
      case "Open conversations": return b.openConversationCount - a.openConversationCount;
      case "Tags": return b.tags.length - a.tags.length;
      case "Last activity":
      default: return 0; // already sorted by last_activity_at from DB
    }
  });
}

export function ContactsShell({
  contacts,
  selectedContact = null,
  company = null,
  linkedConversations = [],
  activeView = "all",
  isDemo = false,
  baseDir = "",
}: ContactsShellProps) {
  const router = useRouter();
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("Last activity");

  const refresh = useCallback(() => {
    setModal(null);
    router.refresh();
  }, [router]);

  const viewFiltered = filterContacts(contacts, activeView);
  const searchFiltered = query.trim()
    ? viewFiltered.filter((c) =>
        [c.fullName, c.companyName, c.email, ...c.tags].some((f) =>
          f.toLowerCase().includes(query.toLowerCase())
        )
      )
    : viewFiltered;
  const filteredContacts = sortContacts(searchFiltered, sortKey);

  return (
    <>
      {modal === "create" && <CreateContactModal onClose={() => setModal(null)} onSaved={refresh} isDemo={isDemo} />}
      {modal === "edit" && selectedContact && (
        <EditContactModal contact={selectedContact} onClose={() => setModal(null)} onSaved={refresh} isDemo={isDemo} />
      )}

      <div className="flex h-full overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="flex h-full w-[330px] shrink-0 flex-col border-r border-[var(--line)] bg-[rgba(255,255,255,0.015)]">
          <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-[9px] text-[var(--muted)]">People</p>
                <h1 className="mt-1 text-base font-semibold">Contacts</h1>
              </div>
              <button
                onClick={() => setModal("create")}
                className="rounded-full bg-[var(--moss)] px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
              >
                + New contact
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Every contact is linked to their company, conversation history, and AI draft context.
            </p>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts, companies, tags…"
              className="mt-3 w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(["Last activity", "Name", "Company", "Open conversations", "Tags"] as SortKey[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSortKey(filter)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                    sortKey === filter
                      ? "border-[var(--moss)] bg-[rgba(120,161,122,0.1)] text-[var(--foreground)]"
                      : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {filter}
                </button>
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
                    href={view.id === "all" ? `${baseDir}/contacts` : `${baseDir}/contacts?view=${view.id}`}
                    className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-sm transition-colors ${
                      isActive ? "bg-[var(--sage)] text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--sage)] hover:text-[var(--foreground)]"
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
            {filteredContacts.length === 0 && (
              <div className="px-3 py-8 text-center">
                <p className="text-xs text-[var(--muted)]">
                  {query.trim() ? "No contacts match your search." : "No contacts yet."}
                </p>
                {!query.trim() && (
                  <button onClick={() => setModal("create")} className="mt-3 rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]">
                    Add first contact
                  </button>
                )}
              </div>
            )}
            {filteredContacts.map((contact) => {
              const isSelected = contact.id === selectedContact?.id;
              return (
                <Link
                  key={contact.id}
                  href={`${baseDir}/contacts/${contact.id}${activeView !== "all" ? `?view=${activeView}` : ""}`}
                  className={`block border-b px-2 py-3 transition-colors ${
                    isSelected
                      ? "rounded-[18px] border-[var(--moss)] bg-[rgba(144,50,61,0.11)]"
                      : "border-transparent hover:rounded-[18px] hover:border-[var(--line)] hover:bg-[var(--panel-strong)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{contact.fullName}</p>
                      <p className="truncate text-xs text-[var(--muted)]">{contact.companyName}</p>
                    </div>
                    <ContactStatusPill status={contact.status} />
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs text-[var(--muted)]">
                    <p className="truncate">{contact.email}</p>
                    <p>{contact.lastActivity}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap gap-1">
                      {contact.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px]">{tag}</span>
                      ))}
                    </div>
                    <span className="text-[10px] text-[var(--muted)]">{contact.openConversationCount} open</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>

        {/* ── Detail pane ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedContact ? (
            <>
              <div className="shrink-0 border-b border-[var(--line)] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow text-[10px] text-[var(--muted)]">Contact record</p>
                    <h2 className="mt-1 text-xl font-semibold">{selectedContact.fullName}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      {selectedContact.email && <span>{selectedContact.email}</span>}
                      {selectedContact.phone && <><span>•</span><span>{selectedContact.phone}</span></>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setModal("edit")}
                      className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]"
                    >
                      Edit info
                    </button>
                    <Link href={`${baseDir}/inbox`} className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white">
                      Open inbox
                    </Link>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-5">
                  {[
                    { label: "Company", value: selectedContact.companyName || "—" },
                    { label: "Tier", value: selectedContact.tier || "—" },
                    { label: "Lifecycle stage", value: selectedContact.editableFields.lifecycleStage || "—" },
                    { label: "Open conversations", value: String(selectedContact.openConversationCount) },
                    { label: "Last activity", value: selectedContact.lastActivity },
                  ].map((m) => (
                    <div key={m.label} className="surface-subtle rounded-[16px] px-4 py-3">
                      <p className="text-[10px] text-[var(--muted)]">{m.label}</p>
                      <p className="mt-1 text-sm font-medium capitalize">{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="scroll-soft overflow-y-auto px-5 py-4 space-y-4">
                  {/* Conversation history */}
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="eyebrow text-[9px] text-[var(--muted)]">Conversation history</p>
                      <Link href={`${baseDir}/inbox`} className="text-xs text-[var(--moss)]">Open inbox</Link>
                    </div>
                    {linkedConversations.length === 0 ? (
                      <p className="mt-3 text-sm text-[var(--muted)]">No conversations yet.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {linkedConversations.map((conv) => (
                          <Link
                            key={conv.id}
                            href={`${baseDir}/inbox/${conv.id}`}
                            className="block rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-4 transition-colors hover:border-[var(--line-strong)]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium">{conv.subject}</p>
                                <p className="mt-0.5 text-xs text-[var(--muted)]">{conv.intent} · {conv.lastSeen}</p>
                              </div>
                              <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]">
                                {conversationStatusLabel[conv.status]}
                              </span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{conv.preview}</p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Identity */}
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Identity</p>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      {[
                        ["First name", selectedContact.firstName],
                        ["Last name", selectedContact.lastName],
                        ["Preferred channel", selectedContact.editableFields.preferredChannel],
                        ["Lifecycle stage", selectedContact.editableFields.lifecycleStage],
                        ["Location", selectedContact.editableFields.location],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <p className="text-[var(--muted)]">{label}</p>
                          <p className="mt-0.5">{value || "—"}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <aside className="scroll-soft border-l border-[var(--line)] overflow-y-auto px-4 py-4 space-y-4">
                  {/* Company */}
                  {company && (
                    <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                      <p className="eyebrow text-[9px] text-[var(--muted)]">Account</p>
                      <Link href={`${baseDir}/companies/${company.id}`} className="mt-2 block text-sm font-medium transition-colors hover:text-[var(--moss)]">
                        {company.name}
                      </Link>
                      <p className="text-xs text-[var(--muted)]">{company.industry}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div><p className="text-[var(--muted)]">Tier</p><p>{selectedContact.tier || "—"}</p></div>
                        <div><p className="text-[var(--muted)]">Open threads</p><p>{company.openConversations}</p></div>
                      </div>
                    </section>
                  )}

                  {/* Notes */}
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Notes</p>
                    {selectedContact.notes.length === 0 ? (
                      <p className="mt-2 text-xs text-[var(--muted)]">No notes yet.</p>
                    ) : (
                      <ul className="mt-3 space-y-2 text-sm leading-6">
                        {selectedContact.notes.map((note) => (
                          <li key={note} className="flex gap-2"><span className="text-[var(--muted)]">•</span><span>{note}</span></li>
                        ))}
                      </ul>
                    )}
                    <button onClick={() => setModal("edit")} className="mt-3 text-[10px] text-[var(--moss)] transition-colors hover:opacity-80">
                      Edit notes →
                    </button>
                  </section>

                  {/* Tags */}
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Tags</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <ContactStatusPill status={selectedContact.status} />
                      {selectedContact.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]">{tag}</span>
                      ))}
                    </div>
                  </section>
                </aside>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-8">
              <div className="max-w-xl rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-8 text-center">
                <p className="eyebrow text-[10px] text-[var(--muted)]">Contacts</p>
                <h2 className="mt-3 text-2xl font-semibold">Select a contact to view their record</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Contacts are linked to their company, conversation history, and pulled into AI draft context automatically.
                </p>
                <button onClick={() => setModal("create")} className="mt-5 rounded-full bg-[var(--moss)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90">
                  Add first contact
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}



