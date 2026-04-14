"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  { id: "all", label: "All accounts" },
  { id: "active", label: "Active accounts" },
  { id: "priority", label: "Priority" },
  { id: "watch", label: "Watch list" },
] as const;

// ── Create / Edit modal ───────────────────────────────────────────────────────

function CompanyFormModal({
  mode,
  initial,
  companyId,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: { name: string; domain: string; industry: string; tier: string; notes: string };
  companyId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    domain: initial?.domain ?? "",
    industry: initial?.industry ?? "",
    tier: initial?.tier ?? "standard",
    notes: initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Company name is required."); return; }
    setSaving(true);

    const url = mode === "create" ? "/api/companies" : `/api/companies/${companyId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        domain: form.domain.trim().toLowerCase() || null,
        industry: form.industry.trim() || null,
        tier: form.tier,
        notes: form.notes.trim() || null,
      }),
    });
    setSaving(false);
    if (res.ok) { onSaved(); }
    else {
      const data = await res.json() as { error?: string };
      setError(data.error ?? "Something went wrong.");
    }
  }

  const tiers = ["standard", "pro", "enterprise", "vip"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="grain-panel w-full max-w-lg rounded-[28px] border border-[var(--line)] shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
        <div className="border-b border-[var(--line)] px-6 py-5">
          <p className="eyebrow text-[10px] text-[var(--muted)]">Companies</p>
          <h2 className="mt-1 text-lg font-semibold">{mode === "create" ? "New account" : `Edit ${initial?.name ?? "account"}`}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="eyebrow text-[10px] text-[var(--muted)]">Company name *</label>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Acme Corp"
                className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="eyebrow text-[10px] text-[var(--muted)]">Domain</label>
                <input
                  value={form.domain}
                  onChange={(e) => set("domain", e.target.value)}
                  placeholder="acme.com"
                  className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
                />
              </div>
              <div>
                <label className="eyebrow text-[10px] text-[var(--muted)]">Industry</label>
                <input
                  value={form.industry}
                  onChange={(e) => set("industry", e.target.value)}
                  placeholder="SaaS, Fintech…"
                  className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="eyebrow text-[10px] text-[var(--muted)]">Account tier</label>
              <div className="mt-1.5 flex gap-2 flex-wrap">
                {tiers.map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => set("tier", tier)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      form.tier === tier
                        ? "bg-[var(--moss)] text-white"
                        : "border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="eyebrow text-[10px] text-[var(--muted)]">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                placeholder="Context about this account…"
                className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors resize-none"
              />
            </div>
            {error && (
              <p className="rounded-[12px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-sm">{error}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--line)] px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-full bg-[var(--moss)] px-5 py-2 text-xs font-medium text-white disabled:opacity-50">
              {saving ? (mode === "create" ? "Creating…" : "Saving…") : (mode === "create" ? "Create account" : "Save changes")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

export function CompaniesShell({
  companies,
  selectedCompany = null,
  companyContacts = [],
  companyConversations = [],
  activeView = "all",
}: CompaniesShellProps) {
  const router = useRouter();
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [query, setQuery] = useState("");

  const refresh = useCallback(() => {
    setModal(null);
    router.refresh();
  }, [router]);

  const viewFiltered = filterCompanies(companies, activeView);
  const filteredCompanies = query.trim()
    ? viewFiltered.filter((c) =>
        [c.name, c.industry, c.accountOwner].some((f) =>
          f.toLowerCase().includes(query.toLowerCase())
        )
      )
    : viewFiltered;

  return (
    <>
      {modal === "create" && (
        <CompanyFormModal mode="create" onClose={() => setModal(null)} onSaved={refresh} />
      )}
      {modal === "edit" && selectedCompany && (
        <CompanyFormModal
          mode="edit"
          companyId={selectedCompany.id}
          initial={{
            name: selectedCompany.name,
            domain: "",
            industry: selectedCompany.industry,
            tier: selectedCompany.tier,
            notes: "",
          }}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}

      <div className="flex h-full overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="flex h-full w-[330px] shrink-0 flex-col border-r border-[var(--line)] bg-[rgba(255,255,255,0.015)]">
          <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-[9px] text-[var(--muted)]">Accounts</p>
                <h1 className="mt-1 text-base font-semibold">Companies</h1>
              </div>
              <button
                onClick={() => setModal("create")}
                className="rounded-full bg-[var(--moss)] px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
              >
                + New account
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Account records linked to contacts, conversation history, and AI draft context.
            </p>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search companies, industry…"
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
            {filteredCompanies.length === 0 && (
              <div className="px-3 py-8 text-center">
                <p className="text-xs text-[var(--muted)]">
                  {query.trim() ? "No companies match your search." : "No companies yet."}
                </p>
                {!query.trim() && (
                  <button onClick={() => setModal("create")} className="mt-3 rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]">
                    Add first account
                  </button>
                )}
              </div>
            )}
            {filteredCompanies.map((company) => {
              const isSelected = company.id === selectedCompany?.id;
              return (
                <Link
                  key={company.id}
                  href={`/companies/${company.id}${activeView !== "all" ? `?view=${activeView}` : ""}`}
                  className={`block border-b px-2 py-3 transition-colors ${
                    isSelected
                      ? "rounded-[18px] border-[var(--moss)] bg-[rgba(144,50,61,0.11)]"
                      : "border-transparent hover:rounded-[18px] hover:border-[var(--line)] hover:bg-[var(--panel-strong)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{company.name}</p>
                      <p className="truncate text-xs text-[var(--muted)]">{company.industry}</p>
                    </div>
                    <span className="rounded-full bg-[var(--sage)] px-2 py-0.5 text-[10px]">
                      {company.openConversations} open
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--muted)]">
                    <div><p>Owner</p><p className="mt-0.5 text-[var(--foreground)]">{company.accountOwner || "—"}</p></div>
                    <div><p>Contacts</p><p className="mt-0.5 text-[var(--foreground)]">{company.activeContacts}</p></div>
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>

        {/* ── Detail pane ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedCompany ? (
            <>
              <div className="shrink-0 border-b border-[var(--line)] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow text-[10px] text-[var(--muted)]">Account record</p>
                    <h2 className="mt-1 text-xl font-semibold">{selectedCompany.name}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      {selectedCompany.industry && <span>{selectedCompany.industry}</span>}
                      <span>•</span>
                      <span>Owner: {selectedCompany.accountOwner || "Unassigned"}</span>
                      <span>•</span>
                      <span>{selectedCompany.openConversations} open threads</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setModal("edit")}
                      className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]"
                    >
                      Edit account
                    </button>
                    <Link href="/contacts" className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white">
                      Add contact
                    </Link>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {[
                    { label: "Owner", value: selectedCompany.accountOwner || "—" },
                    { label: "Industry", value: selectedCompany.industry || "—" },
                    { label: "Active contacts", value: String(selectedCompany.activeContacts) },
                    { label: "Open load", value: `${selectedCompany.openConversations} threads` },
                  ].map((m) => (
                    <div key={m.label} className="surface-subtle rounded-[16px] px-4 py-3">
                      <p className="text-[10px] text-[var(--muted)]">{m.label}</p>
                      <p className="mt-1 text-sm font-medium">{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="scroll-soft overflow-y-auto px-5 py-4 space-y-4">
                  {/* Connected people */}
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="eyebrow text-[9px] text-[var(--muted)]">Connected people</p>
                      <Link href="/contacts" className="text-xs text-[var(--moss)]">All contacts</Link>
                    </div>
                    {companyContacts.length === 0 ? (
                      <p className="mt-3 text-sm text-[var(--muted)]">No contacts linked to this company yet.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {companyContacts.map((contact) => (
                          <Link
                            key={contact.id}
                            href={`/contacts/${contact.id}`}
                            className="block rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-3 transition-colors hover:border-[var(--line-strong)]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{contact.fullName}</p>
                                <p className="text-xs text-[var(--muted)]">{contact.email}</p>
                              </div>
                              <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] capitalize">{contact.status}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Conversations */}
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="eyebrow text-[9px] text-[var(--muted)]">Conversation history</p>
                      <Link href="/inbox" className="text-xs text-[var(--moss)]">Open inbox</Link>
                    </div>
                    {companyConversations.length === 0 ? (
                      <p className="mt-3 text-sm text-[var(--muted)]">No conversations yet.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {companyConversations.map((conv) => (
                          <Link
                            key={conv.id}
                            href={`/inbox/${conv.id}`}
                            className="block rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-4 transition-colors hover:border-[var(--line-strong)]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{conv.subject}</p>
                                <p className="mt-0.5 text-xs text-[var(--muted)]">{conv.customerName} · {conv.intent} · {conv.lastSeen}</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]">
                                {conversationStatusLabel[conv.status]}
                              </span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{conv.preview}</p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                <aside className="scroll-soft border-l border-[var(--line)] overflow-y-auto px-4 py-4 space-y-4">
                  <section className="rounded-[20px] border border-[rgba(144,50,61,0.3)] bg-[rgba(73,17,28,0.18)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--amber)]">Account pressure</p>
                    <ul className="mt-3 space-y-2 text-sm leading-6">
                      <li className="flex gap-2">
                        <span className="text-[var(--muted)]">•</span>
                        <span>{selectedCompany.openConversations} open threads need attention</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-[var(--muted)]">•</span>
                        <span>{selectedCompany.activeContacts} contacts on this account</span>
                      </li>
                    </ul>
                  </section>
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Quick links</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[["Contacts", "/contacts"], ["Inbox", "/inbox"], ["Dashboard", "/dashboard"]].map(([label, href]) => (
                        <Link key={label} href={href} className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[10px] transition-colors hover:border-[var(--moss)]">
                          {label}
                        </Link>
                      ))}
                    </div>
                  </section>
                </aside>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-8">
              <div className="max-w-xl rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-8 text-center">
                <p className="eyebrow text-[10px] text-[var(--muted)]">Companies</p>
                <h2 className="mt-3 text-2xl font-semibold">Select an account to view its workspace</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Company records link directly to contacts, conversation history, and AI draft context.
                </p>
                <button onClick={() => setModal("create")} className="mt-5 rounded-full bg-[var(--moss)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90">
                  Add first account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
