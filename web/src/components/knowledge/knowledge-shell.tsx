"use client";

import Link from "next/link";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { knowledgeCategories, type KnowledgeEntry, type KnowledgeCategory } from "@/lib/mock-data";

type KnowledgeShellProps = {
  entries: KnowledgeEntry[];
  selectedEntry?: KnowledgeEntry | null;
  activeCategory?: KnowledgeCategory | "all";
  isDemo?: boolean;
  baseDir?: string;
};

// ── Gap suggestion type (mirrors GET /api/knowledge/gaps response) ────────────

type GapSuggestion = {
  category: string;
  count: number;
  sampleReasons: string[];
  suggested: {
    title: string;
    summary: string;
    body: string;
    category: "policy" | "sop" | "tone" | "product" | "escalation";
    tags: string[];
  };
};

// ── Category pill ─────────────────────────────────────────────────────────────

const categoryColors: Record<KnowledgeCategory, string> = {
  policy:     "bg-[rgba(144,50,61,0.14)] text-[var(--foreground)] border border-[rgba(144,50,61,0.28)]",
  sop:        "bg-[var(--sage)] text-[var(--foreground)] border border-[var(--line)]",
  tone:       "bg-[rgba(169,146,125,0.12)] text-[var(--foreground)] border border-[rgba(169,146,125,0.24)]",
  product:    "bg-[var(--sage)] text-[var(--foreground)] border border-[var(--line)]",
  escalation: "bg-[rgba(144,50,61,0.14)] text-[var(--foreground)] border border-[rgba(144,50,61,0.28)]",
};

function CategoryPill({ category }: { category: KnowledgeCategory }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium capitalize ${categoryColors[category]}`}>
      {category}
    </span>
  );
}

// ── Entry form modal (create + edit) ─────────────────────────────────────────

type EntryFormData = {
  title: string; summary: string; body: string;
  category: string; tags: string;
};

const EMPTY_FORM: EntryFormData = { title: "", summary: "", body: "", category: "sop", tags: "" };

function EntryFormModal({
  mode,
  initial,
  entryId,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: Partial<EntryFormData>;
  entryId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<EntryFormData>({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  function set(field: keyof EntryFormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  async function handleRewrite() {
    if (!form.body.trim() || rewriting) return;
    setRewriting(true);
    setRewriteError(null);
    try {
      const res = await fetch("/api/knowledge/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: form.body,
          category: form.category,
          title: form.title,
        }),
      });
      const data = await res.json() as { rewritten?: string; error?: string };
      if (res.ok && data.rewritten) {
        set("body", data.rewritten);
      } else {
        setRewriteError(data.error ?? "Rewrite failed. Please try again.");
      }
    } catch {
      setRewriteError("Rewrite failed. Please try again.");
    } finally {
      setRewriting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required."); return; }
    if (!form.body.trim()) { setError("Content is required."); return; }

    setSaving(true);
    setError(null);

    const payload = {
      title: form.title.trim(),
      summary: form.summary.trim() || form.title.trim(),
      body: form.body.trim(),
      category: form.category,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };

    const url = mode === "create" ? "/api/knowledge" : `/api/knowledge/${entryId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
      <div className="grain-panel w-full max-w-2xl rounded-[28px] border border-[var(--line)] shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
        <div className="border-b border-[var(--line)] px-6 py-5">
          <p className="eyebrow text-[10px] text-[var(--muted)]">Knowledge base</p>
          <h2 className="mt-1 text-lg font-semibold">
            {mode === "create" ? "New entry" : "Edit entry"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            This content will be semantically retrieved and injected into AI drafts when relevant.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[60vh] overflow-y-auto scroll-soft px-6 py-5 space-y-4">
            {/* Title */}
            <div>
              <label className="eyebrow text-[10px] text-[var(--muted)]">Title *</label>
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Refund policy — standard tier"
                className="mt-1.5 w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
              />
            </div>

            {/* Category */}
            <div>
              <label className="eyebrow text-[10px] text-[var(--muted)]">Category *</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {(["policy", "sop", "tone", "product", "escalation"] as KnowledgeCategory[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => set("category", cat)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      form.category === cat
                        ? "bg-[var(--moss)] text-white"
                        : "border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div>
              <label className="eyebrow text-[10px] text-[var(--muted)]">Summary <span className="text-[var(--muted)] normal-case font-normal">(shown in list view)</span></label>
              <input
                value={form.summary}
                onChange={(e) => set("summary", e.target.value)}
                placeholder="One-sentence description of this entry"
                className="mt-1.5 w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
              />
            </div>

            {/* Body */}
            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <label className="eyebrow text-[10px] text-[var(--muted)]">Content *</label>
                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                    Write clearly — this text is chunked and retrieved by the AI. Use double line breaks to separate sections.
                  </p>
                </div>
                {/* Rewrite for AI button — optimises content based on selected category */}
                <button
                  type="button"
                  onClick={handleRewrite}
                  disabled={rewriting || !form.body.trim()}
                  title={`Rewrite for AI retrieval (${form.category})`}
                  className="shrink-0 flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-[10px] font-medium text-[var(--muted)] transition-colors hover:border-[var(--moss)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {rewriting ? (
                    <>
                      <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round"/>
                      </svg>
                      Rewriting…
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" fill="currentColor"/>
                      </svg>
                      Rewrite for AI
                    </>
                  )}
                </button>
              </div>
              <textarea
                value={form.body}
                onChange={(e) => set("body", e.target.value)}
                placeholder={`Standard refund policy:\n\nCustomers on the Pro plan can request a full refund within 30 days of purchase...\n\nExceptions:\n- Accounts that have exceeded 80% of their plan limits are not eligible for full refunds.`}
                rows={10}
                className="mt-1.5 w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors font-mono leading-6 resize-y"
              />
              {rewriteError && (
                <p className="mt-1.5 text-[10px] text-[rgba(220,80,80,0.9)]">{rewriteError}</p>
              )}
            </div>

            {/* Tags */}
            <div>
              <label className="eyebrow text-[10px] text-[var(--muted)]">Tags <span className="normal-case font-normal">(comma-separated)</span></label>
              <input
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="refund, billing, pro-plan"
                className="mt-1.5 w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
              />
            </div>

            {error && (
              <p className="rounded-[12px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-sm">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-6 py-4">
            <p className="text-[10px] text-[var(--muted)]">
              Content will be auto-chunked and embedded for semantic search.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[var(--moss)] px-5 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? (mode === "create" ? "Creating…" : "Saving…") : (mode === "create" ? "Create entry" : "Save changes")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────

function DeleteConfirm({ title, entryId, onClose, onDeleted }: {
  title: string; entryId: string; onClose: () => void; onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/knowledge/${entryId}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      onDeleted();
    } else {
      const data = await res.json() as { error?: string };
      setError(data.error ?? "Delete failed.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="grain-panel w-full max-w-sm rounded-[24px] border border-[var(--line)] p-6">
        <h3 className="text-base font-semibold">Delete &ldquo;{title}&rdquo;?</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          This will permanently delete the entry and all its retrieval chunks. AI drafts that used this entry will not be affected.
        </p>
        {error && <p className="mt-3 text-xs text-[rgba(220,80,80,0.9)]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium">Cancel</button>
          <button onClick={handleDelete} disabled={deleting} className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
            {deleting ? "Deleting…" : "Delete entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

export function KnowledgeShell({ 
  entries, 
  selectedEntry = null, 
  activeCategory = "all",
  isDemo = false,
  baseDir = "",
}: KnowledgeShellProps) {
  const router = useRouter();
  const [modal, setModal] = useState<"create" | "edit" | "delete" | null>(null);
  const [query, setQuery] = useState("");
  const [togglingActive, setTogglingActive] = useState(false);
  const [suggestions, setSuggestions] = useState<GapSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(!isDemo);
  const [prefillSuggestion, setPrefillSuggestion] = useState<GapSuggestion["suggested"] | null>(null);

  // Fetch gap suggestions once on mount (skip in demo mode)
  useEffect(() => {
    if (isDemo) return;
    fetch("/api/knowledge/gaps")
      .then((r) => r.ok ? r.json() : Promise.resolve({ suggestions: [] }))
      .then((data: { suggestions?: GapSuggestion[] }) => {
        setSuggestions(data.suggestions ?? []);
      })
      .catch(() => { /* non-critical */ })
      .finally(() => setSuggestionsLoading(false));
  }, [isDemo]);

  async function handleToggleActive() {
    if (!selectedEntry || togglingActive) return;
    setTogglingActive(true);
    await fetch(`/api/knowledge/${selectedEntry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !(selectedEntry.isActive ?? true) }),
    });
    setTogglingActive(false);
    router.refresh();
  }

  const refresh = useCallback(() => {
    setModal(null);
    router.refresh();
  }, [router]);

  const categoryFiltered = activeCategory === "all" ? entries : entries.filter((e) => e.category === activeCategory);
  const filtered = query.trim()
    ? categoryFiltered.filter((e) => [e.title, e.summary, e.category, ...e.tags].some((f) => f.toLowerCase().includes(query.toLowerCase())))
    : categoryFiltered;

  const categoryCounts = Object.fromEntries(
    knowledgeCategories.map((cat) => [
      cat.id,
      cat.id === "all" ? entries.length : entries.filter((e) => e.category === cat.id).length,
    ])
  ) as Record<KnowledgeCategory | "all", number>;

  return (
    <>
      {modal === "create" && (
        <EntryFormModal
          mode="create"
          initial={prefillSuggestion ? {
            title: prefillSuggestion.title,
            summary: prefillSuggestion.summary,
            body: prefillSuggestion.body,
            category: prefillSuggestion.category,
            tags: prefillSuggestion.tags.join(", "),
          } : undefined}
          onClose={() => { setModal(null); setPrefillSuggestion(null); }}
          onSaved={() => { setPrefillSuggestion(null); refresh(); }}
        />
      )}
      {modal === "edit" && selectedEntry && (
        <EntryFormModal
          mode="edit"
          entryId={selectedEntry.id}
          initial={{
            title: selectedEntry.title,
            summary: selectedEntry.summary,
            body: selectedEntry.body,
            category: selectedEntry.category,
            tags: selectedEntry.tags.join(", "),
          }}
          onClose={() => setModal(null)}
          onSaved={refresh}
        />
      )}
      {modal === "delete" && selectedEntry && (
        <DeleteConfirm
          title={selectedEntry.title}
          entryId={selectedEntry.id}
          onClose={() => setModal(null)}
          onDeleted={() => { setModal(null); router.push(`${baseDir}/knowledge`); router.refresh(); }}
        />
      )}

      <div className="flex h-full overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="flex h-full w-[330px] shrink-0 flex-col border-r border-[var(--line)] bg-[rgba(255,255,255,0.015)]">
          <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-[9px] text-[var(--muted)]">Context</p>
                <h1 className="mt-1 text-base font-semibold">Knowledge base</h1>
              </div>
              <button
                onClick={() => setModal("create")}
                className="rounded-full bg-[var(--moss)] px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
              >
                + New entry
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              SOPs, policies, tone guides, and product context fed directly into AI drafts.
            </p>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search entries, tags, category…"
              className="mt-3 w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
            />
          </div>

          {/* Category filters */}
          <div className="shrink-0 border-b border-[var(--line)] px-3 py-3">
            <div className="flex flex-col gap-0.5">
              {knowledgeCategories.map((cat) => {
                const isActive = cat.id === activeCategory;
                return (
                  <Link
                    key={cat.id}
                    href={cat.id === "all" ? `${baseDir}/knowledge` : `${baseDir}/knowledge?category=${cat.id}`}
                    className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-sm transition-colors ${
                      isActive ? "bg-[var(--sage)] text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--sage)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span className="text-xs">{categoryCounts[cat.id]}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="scroll-soft flex-1 overflow-y-auto p-3">
            {filtered.length === 0 && (
              <div className="px-3 py-8 text-center">
                <p className="text-xs text-[var(--muted)]">
                  {query.trim() ? "No entries match your search." : "No entries yet."}
                </p>
                {!query.trim() && (
                  <button onClick={() => setModal("create")} className="mt-3 rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]">
                    Create first entry
                  </button>
                )}
              </div>
            )}
            {filtered.map((entry) => {
              const isSelected = entry.id === selectedEntry?.id;
              return (
                <Link
                  key={entry.id}
                  href={`${baseDir}/knowledge/${entry.id}${activeCategory !== "all" ? `?category=${activeCategory}` : ""}`}
                  className={`block border-b px-2 py-3 transition-colors ${
                    isSelected
                      ? "rounded-[18px] border-[var(--moss)] bg-[rgba(144,50,61,0.11)]"
                      : "border-transparent hover:rounded-[18px] hover:border-[var(--line)] hover:bg-[var(--panel-strong)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium">{entry.title}</p>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{entry.summary}</p>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <CategoryPill category={entry.category} />
                      {!(entry.isActive ?? true) && (
                        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[9px] text-[var(--muted)]">
                          inactive
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--muted)]">{entry.usedInDrafts} drafts</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>

        {/* ── Detail pane ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedEntry ? (
            <>
              <div className="shrink-0 border-b border-[var(--line)] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow text-[10px] text-[var(--muted)]">Knowledge entry</p>
                    <h2 className="mt-1 text-xl font-semibold">{selectedEntry.title}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      <CategoryPill category={selectedEntry.category} />
                      {(selectedEntry.isActive ?? true) ? (
                        <span className="rounded-full border border-[rgba(22,163,74,0.35)] bg-[rgba(22,163,74,0.08)] px-2 py-0.5 text-[10px] text-[rgba(22,163,74,0.9)]">active</span>
                      ) : (
                        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]">inactive — excluded from AI</span>
                      )}
                      <span>Updated {selectedEntry.lastUpdated} by {selectedEntry.updatedBy}</span>
                      <span>•</span>
                      <span>{selectedEntry.usedInDrafts} AI draft retrievals</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleToggleActive}
                      disabled={togglingActive}
                      className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)] disabled:opacity-50"
                    >
                      {togglingActive
                        ? "Saving…"
                        : (selectedEntry.isActive ?? true)
                        ? "Deactivate"
                        : "Activate"}
                    </button>
                    <button onClick={() => setModal("edit")} className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]">
                      Edit entry
                    </button>
                    <button onClick={() => setModal("delete")} className="rounded-full border border-[rgba(144,50,61,0.35)] px-4 py-2 text-xs font-medium text-[var(--moss)] transition-colors hover:bg-[rgba(144,50,61,0.1)]">
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="scroll-soft overflow-y-auto px-5 py-4 space-y-4">
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Summary</p>
                    <p className="mt-3 text-sm leading-6">{selectedEntry.summary}</p>
                  </section>
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Full content</p>
                    <div className="mt-3 space-y-3 text-sm leading-7">
                      {selectedEntry.body.split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
                    </div>
                  </section>
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Retrieval chunks</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">Auto-generated from the content. Each chunk is embedded for semantic search.</p>
                    <div className="mt-3 space-y-2">
                      {selectedEntry.chunks.map((chunk, i) => (
                        <div key={chunk.id} className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-3.5">
                          <p className="eyebrow text-[9px] text-[var(--muted)]">Chunk {i + 1}</p>
                          <p className="mt-1.5 text-sm leading-6">{chunk.text}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <aside className="scroll-soft border-l border-[var(--line)] overflow-y-auto px-4 py-4 space-y-4">
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Tags</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selectedEntry.tags.length === 0
                        ? <span className="text-xs text-[var(--muted)]">No tags</span>
                        : selectedEntry.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]">{tag}</span>
                        ))}
                    </div>
                  </section>
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">AI usage</p>
                    <p className="mt-3 text-2xl font-semibold">{selectedEntry.usedInDrafts}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">draft retrievals</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                      High usage = high editorial leverage. If agents edit drafts sourced from this entry, the content may need updating.
                    </p>
                  </section>
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Quick links</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`${baseDir}/inbox`} className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[10px] transition-colors hover:border-[var(--moss)]">Inbox</Link>
                      <Link href={`${baseDir}/dashboard`} className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[10px] transition-colors hover:border-[var(--moss)]">Dashboard</Link>
                    </div>
                  </section>
                </aside>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-8">
              <div className="max-w-xl rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-8 text-center">
                <p className="eyebrow text-[10px] text-[var(--muted)]">Knowledge base</p>
                <h2 className="mt-3 text-2xl font-semibold">Build the context your AI needs</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Add SOPs, policies, and tone guides. Each entry is chunked and embedded — the AI
                  retrieves the most relevant chunks when drafting replies.
                </p>
                <button
                  onClick={() => setModal("create")}
                  className="mt-5 rounded-full bg-[var(--moss)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
           
                  Create first entry
                </button>
              </div>

            {/* AI-suggested entries — surfaces recurring knowledge gaps */}
            {!isDemo && (suggestions.length > 0 || suggestionsLoading) && (
              <div className="mt-6 w-full max-w-xl px-8">
                <div className="rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="eyebrow text-[10px] text-[var(--muted)]">Self-learning</p>
                      <h3 className="mt-1 text-base font-semibold">Suggested entries</h3>
                    </div>
                    {suggestionsLoading && (
                      <span className="text-xs text-[var(--muted)]">Analysing patterns…</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                    Based on recurring agent edits in the last 30 days. Each suggestion targets a gap the AI keeps running into.
                  </p>
                  <div className="mt-4 space-y-3">
                    {suggestions.map((s, i) => (
                      <div
                        key={i}
                        className="rounded-[18px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{s.suggested.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{s.suggested.summary}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)] capitalize">
                            {s.category}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-[10px] text-[var(--muted)]">
                            {s.count} edits in 30 days
                          </span>
                          <button
                            onClick={() => {
                              setPrefillSuggestion(s.suggested);
                              setModal("create");
                            }}
                            className="rounded-full bg-[var(--moss)] px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
                          >
                            Create entry
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
