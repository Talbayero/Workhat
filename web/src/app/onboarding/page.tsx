"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

type EmailConnection = {
  id: string;
  provider: "gmail" | "outlook";
  provider_account_email: string;
  status: "connected" | "needs_reconnect" | "disabled" | "error";
  sync_status: "idle" | "syncing" | "watching" | "error";
  last_history_id: string | null;
  error_message: string | null;
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
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [urlMessage, setUrlMessage] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const emailError = params.get("emailError");

    if (connected === "gmail") {
      setUrlMessage({ type: "success", message: "Gmail connected. Work Hat can now use this mailbox directly." });
    } else if (emailError) {
      setUrlMessage({ type: "error", message: emailError });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadConnections() {
      setLoadingConnections(true);
      setConnectionError(null);
      try {
        const response = await fetch("/api/email/connections");
        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? "Unable to load email connections.");
        }

        const data = await response.json() as { connections?: EmailConnection[] };
        if (!cancelled) setConnections(data.connections ?? []);
      } catch (error) {
        if (!cancelled) {
          setConnectionError(error instanceof Error ? error.message : "Unable to load email connections.");
        }
      } finally {
        if (!cancelled) setLoadingConnections(false);
      }
    }

    loadConnections();

    return () => {
      cancelled = true;
    };
  }, []);

  const inboundAddress = orgSlug
    ? `inbound+${orgSlug}@work-hat.com`
    : "inbound@work-hat.com";
  const gmailConnection = connections.find((connection) => connection.provider === "gmail");

  async function syncGmail() {
    setSyncing(true);
    setSyncResult(null);
    setConnectionError(null);

    try {
      const response = await fetch("/api/email/gmail/sync", { method: "POST" });
      const data = await response.json().catch(() => ({})) as {
        imported?: number;
        skipped?: number;
        scanned?: number;
        error?: string;
      };

      if (!response.ok) throw new Error(data.error ?? "Gmail sync failed.");

      setSyncResult(
        `Synced ${data.imported ?? 0} new conversations from ${data.scanned ?? 0} recent inbox messages. ${data.skipped ?? 0} duplicates skipped.`
      );
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Gmail sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4 mt-5">
      <div className="rounded-[18px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
        <p className="eyebrow text-[9px] text-[var(--muted)]">Recommended</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Connect Gmail directly</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Work Hat connects with OAuth, stores tokens encrypted, and prepares this mailbox for direct sync and sending.
            </p>
          </div>
          {gmailConnection?.status === "connected" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={syncGmail}
                disabled={syncing}
                className="rounded-full bg-[var(--moss)] px-5 py-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {syncing ? "Syncing..." : "Sync Gmail"}
              </button>
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-300">
                Connected
              </div>
            </div>
          ) : (
            <a
              href="/api/email/gmail/connect"
              className="rounded-full bg-[var(--moss)] px-5 py-2.5 text-center text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Connect Gmail
            </a>
          )}
        </div>

        {gmailConnection && (
          <div className="mt-4 rounded-[14px] border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-xs">
            <p className="font-medium">{gmailConnection.provider_account_email}</p>
            <p className="mt-1 text-[var(--muted)]">
              Status: {gmailConnection.status} · Sync: {gmailConnection.sync_status}
              {gmailConnection.last_history_id ? ` · History ${gmailConnection.last_history_id}` : ""}
            </p>
          </div>
        )}

        {loadingConnections && (
          <p className="mt-3 text-xs text-[var(--muted)]">Checking existing connections...</p>
        )}
        {connectionError && (
          <p className="mt-3 text-xs text-[rgba(220,80,80,0.9)]">{connectionError}</p>
        )}
        {syncResult && (
          <p className="mt-3 rounded-[12px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
            {syncResult}
          </p>
        )}
        {urlMessage && (
          <p
            className={`mt-3 rounded-[12px] border px-4 py-3 text-xs ${
              urlMessage.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] text-[var(--foreground)]"
            }`}
          >
            {urlMessage.message}
          </p>
        )}
      </div>

      <div className="rounded-[18px] border border-[var(--line)] bg-[var(--panel-strong)] p-4 opacity-70">
        <p className="eyebrow text-[9px] text-[var(--muted)]">Coming next</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Connect Outlook / Microsoft 365</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Same Work Hat connector layer, using Microsoft Graph subscriptions and delta sync.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="rounded-full border border-[var(--line-strong)] px-5 py-2.5 text-xs font-medium text-[var(--muted)]"
          >
            Soon
          </button>
        </div>
      </div>

      <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
        <p className="eyebrow text-[9px] text-[var(--muted)]">Fallback forwarding address</p>
        <p className="mt-2 text-xs leading-6 text-[var(--muted)]">
          If direct connection is not available, forward your support mailbox to this address.
          Every forwarded email creates a conversation in your inbox automatically.
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
        <p className="eyebrow text-[9px] text-[var(--muted)]">Forwarding setup</p>
        <p className="text-[var(--muted)]">
          1. Go to your email provider (Gmail, Google Workspace, Outlook, etc.)
        </p>
        <p className="text-[var(--muted)]">
          2. Find &quot;Forwarding&quot; in settings and add the address above
        </p>
        <p className="text-[var(--muted)]">
          3. Confirm the verification email that arrives in your inbox
        </p>
      </div>
      <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
        <p className="text-xs text-[var(--muted)]">
          Direct email connection is the long-term path. Forwarding remains available for providers or teams that need a simpler fallback.
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
        Invite your agents and managers. Each person can create a password-based
        account and join your workspace. You can add more from Settings → Team any time.
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("step") === "inbox") {
      setCurrentStep(1);
      setCompleted((prev) => new Set([...prev, 0]));
    }
  }, []);

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
