"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ─────────────────────────────────────────────
   NewConversationButton
   Opens a modal to create a conversation manually.
   Used for testing and outbound-initiated threads.
───────────────────────────────────────────── */

interface OrgIntent {
  id: string;
  name: string;
  color: string;
  keywords: string[];
  priority_order: number;
}

// Fallback intents used before org intents load (or if org has none)
const FALLBACK_INTENTS: OrgIntent[] = [
  { id: "support", name: "support", color: "#78A17A", keywords: [], priority_order: 1 },
  { id: "billing", name: "billing", color: "#A99162", keywords: [], priority_order: 2 },
  { id: "onboarding", name: "onboarding", color: "#6B8EAD", keywords: [], priority_order: 3 },
  { id: "feature_request", name: "feature_request", color: "#8E7BA8", keywords: [], priority_order: 4 },
  { id: "escalation", name: "escalation", color: "#904B4B", keywords: [], priority_order: 5 },
  { id: "general", name: "general", color: "#888888", keywords: [], priority_order: 6 },
];

// Client-side intent classifier — mirrors server logic
function detectIntent(text: string, intents: OrgIntent[]): string | null {
  const lower = text.toLowerCase();
  for (const intent of intents) {
    for (const kw of intent.keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Whole-word for single tokens, substring for multi-word phrases
      const pattern = kw.includes(" ")
        ? new RegExp(escaped, "i")
        : new RegExp(`\\b${escaped}\\b`, "i");
      if (pattern.test(lower)) return intent.name;
    }
  }
  return null;
}

export function NewConversationButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [intents, setIntents] = useState<OrgIntent[]>(FALLBACK_INTENTS);
  const [intentsLoaded, setIntentsLoaded] = useState(false);
  const [autoDetected, setAutoDetected] = useState<string | null>(null);
  const [form, setForm] = useState({
    contactEmail: "",
    contactName: "",
    subject: "",
    firstMessage: "",
    intent: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoClassifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load org intents when modal opens
  useEffect(() => {
    if (!open || intentsLoaded) return;
    fetch("/api/intents")
      .then((r) => r.ok ? r.json() : null)
      .then((data: { intents?: OrgIntent[] } | null) => {
        if (data?.intents && data.intents.length > 0) {
          setIntents(data.intents);
        }
        setIntentsLoaded(true);
      })
      .catch(() => setIntentsLoaded(true));
  }, [open, intentsLoaded]);

  // Debounced auto-classify as user types subject/message
  const scheduleAutoClassify = useCallback((subject: string, message: string) => {
    if (autoClassifyTimer.current) clearTimeout(autoClassifyTimer.current);
    autoClassifyTimer.current = setTimeout(() => {
      const text = `${subject} ${message}`.trim();
      if (!text) { setAutoDetected(null); return; }
      const detected = detectIntent(text, intents);
      setAutoDetected(detected);
      // Only auto-select if the user hasn't manually chosen yet
      if (detected) {
        setForm((f) => ({ ...f, intent: detected }));
      }
    }, 300);
  }, [intents]);

  function set(field: string, value: string) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "subject" || field === "firstMessage") {
        scheduleAutoClassify(
          field === "subject" ? value : f.subject,
          field === "firstMessage" ? value : f.firstMessage,
        );
      }
      return next;
    });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contactEmail.trim() || !form.contactEmail.includes("@")) {
      setError("Valid email is required.");
      return;
    }
    if (!form.subject.trim()) { setError("Subject is required."); return; }
    if (!form.firstMessage.trim()) { setError("Message is required."); return; }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        const { conversationId } = await res.json() as { conversationId: string };
        setOpen(false);
        setForm({ contactEmail: "", contactName: "", subject: "", firstMessage: "", intent: "" });
        setAutoDetected(null);
        router.push(`/inbox/${conversationId}`);
        router.refresh();
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Something went wrong.");
      }
    } catch {
      setError("Network error. Please try again.");
    }

    setSaving(false);
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-[var(--moss)] px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
        title="New conversation"
      >
        + New
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="grain-panel w-full max-w-lg rounded-[28px] border border-[var(--line)] shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
            <div className="border-b border-[var(--line)] px-6 py-5">
              <p className="eyebrow text-[10px] text-[var(--muted)]">Inbox</p>
              <h2 className="mt-1 text-lg font-semibold">New conversation</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Simulate an inbound message — useful for testing AI drafts before email is configured.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 space-y-4">

                {/* Contact */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="eyebrow text-[10px] text-[var(--muted)]">Contact email *</label>
                    <input
                      type="email"
                      value={form.contactEmail}
                      onChange={(e) => set("contactEmail", e.target.value)}
                      placeholder="customer@company.com"
                      className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="eyebrow text-[10px] text-[var(--muted)]">Contact name</label>
                    <input
                      type="text"
                      value={form.contactName}
                      onChange={(e) => set("contactName", e.target.value)}
                      placeholder="Jane Smith"
                      className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
                    />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="eyebrow text-[10px] text-[var(--muted)]">Subject *</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => set("subject", e.target.value)}
                    placeholder="e.g. Invoice #4821 — need urgent clarification"
                    className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
                  />
                </div>

                {/* Intent */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="eyebrow text-[10px] text-[var(--muted)]">Intent</label>
                    {autoDetected && (
                      <span className="text-[10px] text-[var(--moss)]">
                        ✦ Auto-detected
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {/* "Let AI decide" pill — sends no intent, server classifies */}
                    <button
                      key="__auto"
                      type="button"
                      onClick={() => { setForm((f) => ({ ...f, intent: "" })); setAutoDetected(null); }}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        !form.intent
                          ? "bg-[var(--moss)] text-white"
                          : "border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      Auto
                    </button>
                    {intents.map((opt) => {
                      const isSelected = form.intent === opt.name;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => { setForm((f) => ({ ...f, intent: opt.name })); setAutoDetected(null); }}
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                            isSelected
                              ? "text-white"
                              : "border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
                          }`}
                          style={isSelected ? { backgroundColor: opt.color } : undefined}
                        >
                          {!isSelected && (
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: opt.color }}
                            />
                          )}
                          {opt.name.replace(/_/g, " ")}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* First message */}
                <div>
                  <label className="eyebrow text-[10px] text-[var(--muted)]">Customer message *</label>
                  <textarea
                    value={form.firstMessage}
                    onChange={(e) => set("firstMessage", e.target.value)}
                    placeholder={"Hi,\n\nI wanted to reach out about invoice #4821. The amount charged doesn't match what we agreed on. Can you please clarify?\n\nThanks,\nJane"}
                    rows={6}
                    className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-sm placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors resize-none leading-6"
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
                  Contact and company are created automatically if they don&apos;t exist.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setError(null); setAutoDetected(null); }}
                    className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-[var(--moss)] px-5 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "Creating…" : "Create conversation"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
