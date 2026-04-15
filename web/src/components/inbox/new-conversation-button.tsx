"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/* ─────────────────────────────────────────────
   NewConversationButton
   Opens a modal to create a conversation manually.
   Used for testing and outbound-initiated threads.
───────────────────────────────────────────── */

const INTENT_OPTIONS = [
  { value: "support", label: "Support" },
  { value: "billing", label: "Billing" },
  { value: "onboarding", label: "Onboarding" },
  { value: "feature_request", label: "Feature request" },
  { value: "escalation", label: "Escalation" },
  { value: "general", label: "General" },
];

export function NewConversationButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    contactEmail: "",
    contactName: "",
    subject: "",
    firstMessage: "",
    intent: "support",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
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
        setForm({ contactEmail: "", contactName: "", subject: "", firstMessage: "", intent: "support" });
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
                  <label className="eyebrow text-[10px] text-[var(--muted)]">Intent</label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {INTENT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set("intent", opt.value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          form.intent === opt.value
                            ? "bg-[var(--moss)] text-white"
                            : "border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
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
                    onClick={() => { setOpen(false); setError(null); }}
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
