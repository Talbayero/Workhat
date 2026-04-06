"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useState } from "react";

import {
  knowledgeCategories,
  knowledgeEntries,
  filterKnowledgeEntries,
  getKnowledgeEntryById,
  type KnowledgeEntry,
  type KnowledgeCategory,
} from "@/lib/mock-data";

type KnowledgeShellProps = {
  selectedEntryId?: string;
  activeCategory?: KnowledgeCategory | "all";
};

function Phase2Modal({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-6">
        <p className="eyebrow text-[10px] text-[var(--muted)]">Coming in Phase 2</p>
        <h3 className="mt-2 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          This action will be fully functional once Supabase is connected. Knowledge
          entries will be stored, versioned, and linked to AI draft usage analytics.
        </p>
        <div className="mt-4 flex justify-end">
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

const categoryColors: Record<KnowledgeCategory, string> = {
  policy:
    "bg-[rgba(144,50,61,0.14)] text-[var(--foreground)] border border-[rgba(144,50,61,0.28)]",
  sop: "bg-[var(--sage)] text-[var(--foreground)] border border-[var(--line)]",
  tone: "bg-[rgba(169,146,125,0.12)] text-[var(--foreground)] border border-[rgba(169,146,125,0.24)]",
  product:
    "bg-[var(--sage)] text-[var(--foreground)] border border-[var(--line)]",
  escalation:
    "bg-[rgba(144,50,61,0.14)] text-[var(--foreground)] border border-[rgba(144,50,61,0.28)]",
};

function CategoryPill({ category }: { category: KnowledgeCategory }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-medium capitalize ${categoryColors[category]}`}
    >
      {category}
    </span>
  );
}

function getSelected(id?: string): KnowledgeEntry | null {
  if (!id) return null;
  const entry = getKnowledgeEntryById(id);
  if (!entry) notFound();
  return entry;
}

export function KnowledgeShell({ selectedEntryId, activeCategory = "all" }: KnowledgeShellProps) {
  const [modal, setModal] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const selected = getSelected(selectedEntryId);
  const categoryFiltered = filterKnowledgeEntries(activeCategory);
  const filtered = query.trim()
    ? categoryFiltered.filter((e) =>
        [e.title, e.summary, e.category, ...e.tags].some((field) =>
          field.toLowerCase().includes(query.toLowerCase())
        )
      )
    : categoryFiltered;

  // Compute real category counts from actual entries
  const categoryCounts = Object.fromEntries(
    knowledgeCategories.map((cat) => [
      cat.id,
      cat.id === "all" ? knowledgeEntries.length : knowledgeEntries.filter((e) => e.category === cat.id).length,
    ])
  ) as Record<KnowledgeCategory | "all", number>;

  return (
    <>
      {modal && <Phase2Modal title={modal} onClose={() => setModal(null)} />}
    <div className="flex h-full overflow-hidden">
      {/* ── Entry list ── */}
      <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-[var(--line)]">
        <div className="shrink-0 border-b border-[var(--line)] px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold">Knowledge base</h1>
            <button
              onClick={() => setModal("New knowledge entry")}
              className="rounded-full bg-[var(--moss)] px-3 py-1.5 text-[11px] font-medium text-white"
            >
              New entry
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            SOPs, policies, tone guides, and product context fed directly into AI
            draft generation.
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
                  href={cat.id === "all" ? "/knowledge" : `/knowledge?category=${cat.id}`}
                  className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-[var(--sage)] text-[var(--foreground)]"
                      : "text-[var(--muted)] hover:bg-[var(--sage)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <span>{cat.label}</span>
                  <span className="text-xs">{categoryCounts[cat.id]}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Entry rows */}
        <div className="scroll-soft flex-1 space-y-2 overflow-y-auto p-3">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">
              {query.trim() ? "No entries match your search." : "No entries in this category yet."}
            </p>
          )}
          {filtered.map((entry) => {
            const isSelected = entry.id === selectedEntryId;
            return (
              <Link
                key={entry.id}
                href={`/knowledge/${entry.id}${activeCategory !== "all" ? `?category=${activeCategory}` : ""}`}
                className={`block rounded-[20px] border p-3.5 transition-colors ${
                  isSelected
                    ? "border-[var(--moss)] bg-[rgba(144,50,61,0.11)]"
                    : "border-[var(--line)] bg-[var(--panel-strong)] hover:border-[var(--line-strong)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium">{entry.title}</p>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                  {entry.summary}
                </p>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <CategoryPill category={entry.category} />
                  <span className="text-[10px] text-[var(--muted)]">
                    {entry.usedInDrafts} drafts
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </aside>

      {/* ── Entry detail ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selected ? (
          <>
            {/* Header */}
            <div className="shrink-0 border-b border-[var(--line)] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow text-[10px] text-[var(--muted)]">
                    Knowledge entry
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">{selected.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <CategoryPill category={selected.category} />
                    <span>Updated {selected.lastUpdated} by {selected.updatedBy}</span>
                    <span>•</span>
                    <span>{selected.usedInDrafts} AI drafts used this</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setModal("Edit knowledge entry")}
                    className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium"
                  >
                    Edit entry
                  </button>
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_300px]">
              {/* Main content */}
              <div className="scroll-soft overflow-y-auto px-5 py-4">
                <div className="space-y-4">
                  {/* Summary */}
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Summary</p>
                    <p className="mt-3 text-sm leading-6">{selected.summary}</p>
                  </section>

                  {/* Full body */}
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Full content</p>
                    <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--foreground)]">
                      {selected.body.split("\n\n").map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>
                  </section>

                  {/* Retrieval chunks */}
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">
                      Retrieval chunks
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      These are the segments the AI searches when generating drafts.
                    </p>
                    <div className="mt-3 space-y-2">
                      {selected.chunks.map((chunk, i) => (
                        <div
                          key={chunk.id}
                          className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-3.5"
                        >
                          <p className="eyebrow text-[9px] text-[var(--muted)]">
                            Chunk {i + 1}
                          </p>
                          <p className="mt-1.5 text-sm leading-6">{chunk.text}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>

              {/* Sidebar metadata */}
              <aside className="scroll-soft border-l border-[var(--line)] overflow-y-auto px-4 py-4">
                <div className="space-y-4">
                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Tags</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selected.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">AI usage</p>
                    <div className="mt-3 space-y-3 text-sm">
                      <div>
                        <p className="text-[var(--muted)]">Used in drafts</p>
                        <p className="mt-1 text-2xl font-semibold">
                          {selected.usedInDrafts}
                        </p>
                      </div>
                      <p className="text-xs leading-5 text-[var(--muted)]">
                        Every time the AI retrieves a chunk from this entry to
                        generate a draft, it counts here. High usage = high
                        editorial leverage.
                      </p>
                    </div>
                  </section>

                  <section className="rounded-[20px] border border-[rgba(144,50,61,0.3)] bg-[rgba(73,17,28,0.18)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--amber)]">
                      Maintenance signal
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                      If agents frequently edit drafts sourced from this entry,
                      the content may need updating. Check edit patterns in the
                      Dashboard.
                    </p>
                  </section>

                  <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
                    <p className="eyebrow text-[9px] text-[var(--muted)]">Module links</p>
                    <div className="mt-3 flex flex-wrap gap-2">
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
              <p className="eyebrow text-[10px] text-[var(--muted)]">Knowledge base</p>
              <h2 className="mt-3 text-2xl font-semibold">
                Choose an entry to view its content and retrieval chunks
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                SOPs, policies, and tone guides live here. The AI reads these when
                generating drafts — so the quality of what's in here directly
                determines draft quality.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
