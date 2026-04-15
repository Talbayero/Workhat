"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// ── Shared form state (lifted to parent) ──────────────────────────────────────

type OrgFields = {
  orgName: string;
  supportEmail: string;
  timezone: string;
};

type InviteFields = {
  emails: string;
  role: "agent" | "manager" | "qa_reviewer";
};

// ── Reusable input components ─────────────────────────────────────────────────

function InputField({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="eyebrow text-[10px] text-[var(--muted)]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
      />
    </div>
  );
}

// ── Step components (receive state as props) ──────────────────────────────────

function StepOrg({ fields, onChange }: { fields: OrgFields; onChange: (f: Partial<OrgFields>) => void }) {
  return (
    <div className="space-y-4 mt-5">
      <InputField
        label="Organization name"
        placeholder="Acme Support"
        value={fields.orgName}
        onChange={(v) => onChange({ orgName: v })}
      />
      <InputField
        label="Support email"
        placeholder="support@acme.com"
        type="email"
        value={fields.supportEmail}
        onChange={(v) => onChange({ supportEmail: v })}
      />
      <InputField
        label="Timezone"
        placeholder="America/New_York"
        value={fields.timezone}
        onChange={(v) => onChange({ timezone: v })}
      />
    </div>
  );
}

function StepInbox({ orgSlug }: { orgSlug: string }) {
  const inboundAddress = orgSlug
    ? `inbound+${orgSlug}@work-hat.com`
    : "inbound@work-hat.com";

  return (
    <div className="space-y-4 mt-5">
      <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
        <p className="eyebrow text-[9px] text-[var(--muted)]">Your inbound email address</p>
        <p className="mt-2 text-xs leading-6 text-[var(--muted)]">
          Forward your support mailbox to this address. Every email creates a
          conversation in your inbox automatically.
        </p>
        <div
          className="mt-3 flex items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--sage)] px-4 py-3 font-mono text-sm cursor-pointer"
          onClick={() => navigator.clipboard?.writeText(inboundAddress)}
          title="Click to copy"
        >
          <span>{inboundAddress}</span>
          <span className="text-[10px] text-[var(--muted)]">click to copy</span>
        </div>
      </div>
      <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4 space-y-2 text-sm">
        <p className="eyebrow text-[9px] text-[var(--muted)]">How to set up forwarding</p>
        <p className="text-[var(--muted)]">
          1. Go to your email provider (Gmail, Google Workspace, Outlook, etc.)
        </p>
        <p className="text-[var(--muted)]">
          2. Find "Forwarding" in settings and add the address above
        </p>
        <p className="text-[var(--muted)]">
          3. Confirm the verification email that arrives in your inbox
        </p>
      </div>
      <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
        <p className="text-xs text-[var(--muted)]">
          Additional channels (SMS, live chat) are on the roadmap. Email is the full-featured channel at launch.
        </p>
      </div>
    </div>
  );
}

function StepKnowledge() {
  const [saved, setSaved] = useState<string[]>([]);
  const [form, setForm] = useState({ title: "", category: "policy", body: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleSave() {
    if (!form.title.trim() || !form.body.trim()) {
      setError("Title and content are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          body: form.body.trim(),
          category: form.category,
          summary: form.title.trim(),
          tags: [],
        }),
      });
      if (res.ok) {
        setSaved((prev) => [...prev, form.title.trim()]);
        setForm({ title: "", category: "policy", body: "" });
        setShowForm(false);
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Failed to save entry.");
      }
    } catch {
      setError("Network error. Try again.");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4 mt-5">
      <p className="text-sm leading-6 text-[var(--muted)]">
        Add your first knowledge entry — a return policy, SOP, or tone guide. The AI
        reads these before drafting replies. You can add more any time in the Knowledge base.
      </p>

      {saved.length > 0 && (
        <div className="space-y-2">
          {saved.map((title) => (
            <div key={title} className="flex items-center justify-between rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
              <span className="text-sm font-medium">{title}</span>
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                <span className="status-dot status-dot-green" />
                Saved
              </span>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5 space-y-3">
          <div>
            <label className="eyebrow text-[10px] text-[var(--muted)]">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Refund policy — standard tier"
              className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--moss)] transition-colors"
            />
          </div>
          <div>
            <label className="eyebrow text-[10px] text-[var(--muted)]">Category</label>
            <div className="mt-1.5 flex gap-2 flex-wrap">
              {(["policy", "sop", "tone", "product"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, category: cat }))}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    form.category === cat
                      ? "bg-[var(--moss)] text-white"
                      : "border border-[var(--line-strong)] text-[var(--muted)]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="eyebrow text-[10px] text-[var(--muted)]">Content</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder={"Standard refund policy:\n\nCustomers can request a full refund within 30 days of purchase..."}
              rows={6}
              className="mt-1.5 w-full rounded-[12px] border border-[var(--line)] bg-[var(--background)] px-3 py-2.5 text-sm font-mono leading-6 outline-none focus:border-[var(--moss)] transition-colors resize-none"
            />
          </div>
          {error && <p className="text-xs text-[rgba(220,80,80,0.9)]">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-[var(--moss)] px-5 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save entry"}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(null); }}
              className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full rounded-[20px] border-2 border-dashed border-[var(--line)] bg-[var(--panel-strong)] px-6 py-8 text-center transition-colors hover:border-[var(--moss)]"
        >
          <p className="text-sm font-medium">+ Add a knowledge entry</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Policy, SOP, tone guide, or product docs</p>
        </button>
      )}

      <p className="text-xs text-[var(--muted)]">
        You can skip this and add entries after setup in the Knowledge base.
      </p>
    </div>
  );
}

function StepInvite({
  fields,
  onChange,
}: {
  fields: InviteFields;
  onChange: (f: Partial<InviteFields>) => void;
}) {
  return (
    <div className="space-y-4 mt-5">
      <p className="text-sm leading-6 text-[var(--muted)]">
        Invite your agents and managers. Each person gets a magic link to set up
        their account. You can add more from Settings → Team any time.
      </p>
      <div>
        <label className="eyebrow text-[10px] text-[var(--muted)]">
          Email addresses (comma-separated)
        </label>
        <textarea
          value={fields.emails}
          onChange={(e) => onChange({ emails: e.target.value })}
          placeholder="agent@yourteam.com, manager@yourteam.com"
          rows={3}
          className="mt-1.5 w-full rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors resize-none"
        />
      </div>
      <div>
        <label className="eyebrow text-[10px] text-[var(--muted)]">Role for all invitees</label>
        <div className="mt-2 flex gap-2">
          {(["agent", "manager", "qa_reviewer"] as const).map((r) => (
            <button
              key={r}
              onClick={() => onChange({ role: r })}
              className={`rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                fields.role === r
                  ? "border-[var(--moss)] bg-[rgba(120,161,122,0.1)] text-[var(--foreground)]"
                  : "border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {r === "qa_reviewer" ? "QA reviewer" : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4 space-y-2 text-sm">
        <p className="eyebrow text-[9px] text-[var(--muted)]">Roles</p>
        <p className="text-[var(--muted)]">
          <span className="text-[var(--foreground)]">Agent</span> — handles conversations, uses AI drafts
        </p>
        <p className="text-[var(--muted)]">
          <span className="text-[var(--foreground)]">Manager</span> — plus dashboard, edit analyzer, QA queue
        </p>
        <p className="text-[var(--muted)]">
          <span className="text-[var(--foreground)]">QA reviewer</span> — read-only + review comments
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type StepId = "org" | "inbox" | "knowledge" | "invite";

const STEP_META: { id: StepId; title: string; description: string }[] = [
  {
    id: "org",
    title: "Create your organization",
    description: "Name your workspace and set your support email.",
  },
  {
    id: "inbox",
    title: "Connect your inbox",
    description: "Forward your support mailbox to start routing emails.",
  },
  {
    id: "knowledge",
    title: "Upload your SOPs",
    description: "Policies and tone guides the AI reads before drafting.",
  },
  {
    id: "invite",
    title: "Invite your team",
    description: "Add agents, managers, and QA reviewers.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared form state across steps
  const [orgFields, setOrgFields] = useState<OrgFields>({
    orgName: "",
    supportEmail: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/New_York",
  });
  const [orgSlug, setOrgSlug] = useState("");
  const [inviteFields, setInviteFields] = useState<InviteFields>({
    emails: "",
    role: "agent",
  });

  const step = STEP_META[currentStep];
  const isLast = currentStep === STEP_META.length - 1;

  // ── Step advance logic ────────────────────────────────────────────────────

  async function advance() {
    setError(null);
    setLoading(true);

    try {
      if (currentStep === 0) {
        // Step 1: create the org
        if (!orgFields.orgName.trim()) {
          setError("Organization name is required.");
          return;
        }

        const res = await fetch("/api/org/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orgFields),
        });

        if (!res.ok) {
          if (res.status === 401) {
            router.replace("/login?next=/onboarding");
            return;
          }
          const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string; hint?: string };
          const detail = [data.error, data.hint].filter(Boolean).join(" — ");
          throw new Error(detail || "Failed to create organization");
        }

        const data = await res.json();
        setOrgSlug(data.org?.slug ?? "");
      }

      if (isLast) {
        // Step 4: send invites if any emails were entered
        const emailList = inviteFields.emails
          .split(/[,\n]+/)
          .map((e) => e.trim())
          .filter((e) => e.includes("@"));

        if (emailList.length > 0) {
          const res = await fetch("/api/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emails: emailList, role: inviteFields.role }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            // Non-fatal — log but proceed to inbox
            console.warn("[onboarding] invite error:", data.error);
          }
        }

        router.push("/inbox");
        return;
      }

      // Mark step complete and advance
      setCompleted((prev) => new Set([...prev, currentStep]));
      setCurrentStep((s) => s + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function skip() {
    setError(null);
    setCompleted((prev) => new Set([...prev, currentStep]));
    if (isLast) {
      router.push("/inbox");
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  // ── Step content ──────────────────────────────────────────────────────────

  const stepContent = {
    org: (
      <StepOrg
        fields={orgFields}
        onChange={(f) => setOrgFields((prev) => ({ ...prev, ...f }))}
      />
    ),
    inbox: <StepInbox orgSlug={orgSlug} />,
    knowledge: <StepKnowledge />,
    invite: (
      <StepInvite
        fields={inviteFields}
        onChange={(f) => setInviteFields((prev) => ({ ...prev, ...f }))}
      />
    ),
  };

  return (
    <main className="flex min-h-screen items-start justify-center p-6 lg:p-10">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8">
          <p className="eyebrow text-[10px] text-[var(--muted)]">Work Hat · Setup</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Get ready for your first AI-assisted reply
          </h1>
        </div>

        {/* Step progress */}
        <div className="mb-6 flex gap-2">
          {STEP_META.map((s, i) => (
            <button
              key={s.id}
              onClick={() => {
                if (i <= Math.max(currentStep, ...completed)) {
                  setCurrentStep(i);
                  setError(null);
                }
              }}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i === currentStep
                  ? "bg-[var(--moss)]"
                  : completed.has(i)
                  ? "bg-[var(--moss)] opacity-40"
                  : "bg-[var(--sage)]"
              }`}
              aria-label={`Go to step ${i + 1}: ${s.title}`}
            />
          ))}
        </div>

        {/* Step card */}
        <section className="grain-panel rounded-[28px] border border-[var(--line)] p-7">
          <p className="eyebrow text-[10px] text-[var(--muted)]">
            Step {currentStep + 1} of {STEP_META.length}
          </p>
          <h2 className="mt-2 text-xl font-semibold">{step.title}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{step.description}</p>

          {stepContent[step.id]}

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-[14px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-7 flex items-center justify-between gap-4">
            <button
              onClick={() => { setCurrentStep((s) => s - 1); setError(null); }}
              disabled={currentStep === 0}
              className="text-sm text-[var(--muted)] disabled:opacity-0 transition-opacity"
            >
              ← Back
            </button>
            <div className="flex gap-2">
              {/* Skip is always available except on step 1 (org creation is required) */}
              {currentStep !== 0 && (
                <button
                  onClick={skip}
                  disabled={loading}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
                >
                  Skip
                </button>
              )}
              <button
                onClick={advance}
                disabled={loading}
                className="rounded-full bg-[var(--moss)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 transition-opacity min-w-[120px]"
              >
                {loading
                  ? "Working…"
                  : isLast
                  ? "Go to inbox →"
                  : "Continue →"}
              </button>
            </div>
          </div>
        </section>

        <p className="mt-5 text-center text-xs text-[var(--muted)]">
          Already set up?{" "}
          <button onClick={() => router.push("/login")} className="text-[var(--moss)]">
            Sign in instead
          </button>
        </p>
      </div>
    </main>
  );
}
