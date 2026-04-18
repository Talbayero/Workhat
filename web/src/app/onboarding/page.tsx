"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
  last_sync_at: string | null;
  watch_expires_at: string | null;
  error_message: string | null;
};

type SettingsOrgResponse = {
  org?: {
    name?: string;
    slug?: string;
  };
  channel?: {
    supportEmail?: string;
    timezone?: string;
    inboundAddress?: string;
  };
};

function fallbackInboundAddress(slug: string) {
  return slug ? `inbound+${slug}@work-hat.com` : "inbound@work-hat.com";
}

function friendlyEmailConnectorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("google_client") ||
    normalized.includes("not configured") ||
    normalized.includes("server key") ||
    normalized.includes("supabase") ||
    normalized.includes("admin database") ||
    normalized.includes("environment")
  ) {
    return "Gmail connection is not ready yet. Please contact your Work Hat administrator.";
  }

  if (normalized.includes("denied") || normalized.includes("not approved") || normalized.includes("cancelled")) {
    return "Google sign-in was cancelled or access was not approved. Please try again when you are ready.";
  }

  if (normalized.includes("expired")) {
    return "Your Google sign-in session expired. Please try again.";
  }

  return message;
}

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

function StepInbox({ inboundAddress }: { inboundAddress: string }) {
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [urlMessage, setUrlMessage] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [watching, setWatching] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const emailError = params.get("emailError");

    if (connected === "gmail") {
      setUrlMessage({ type: "success", message: "Gmail connected. We are importing recent conversations now." });
      void syncGmail();
    } else if (emailError) {
      setUrlMessage({ type: "error", message: friendlyEmailConnectorMessage(emailError) });
    }
    // OAuth return params should only be consumed once on page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadConnections();
  }, []);

  const gmailConnection = connections.find((connection) => connection.provider === "gmail");

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
      setConnections(data.connections ?? []);
    } catch (error) {
      setConnectionError(
        friendlyEmailConnectorMessage(error instanceof Error ? error.message : "Unable to load email connections.")
      );
    } finally {
      setLoadingConnections(false);
    }
  }

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
      await loadConnections();
    } catch (error) {
      setConnectionError(
        friendlyEmailConnectorMessage(error instanceof Error ? error.message : "Gmail sync failed.")
      );
    } finally {
      setSyncing(false);
    }
  }

  async function enableGmailWatch() {
    setWatching(true);
    setSyncResult(null);
    setConnectionError(null);

    try {
      const response = await fetch("/api/email/gmail/watch", { method: "POST" });
      const data = await response.json().catch(() => ({})) as {
        expiration?: string;
        error?: string;
      };

      if (!response.ok) throw new Error(data.error ?? "Failed to enable Gmail live watch.");

      setSyncResult(
        `Live Gmail watch enabled${data.expiration ? ` until ${new Date(data.expiration).toLocaleString()}` : ""}.`
      );
      await loadConnections();
    } catch (error) {
      setConnectionError(
        friendlyEmailConnectorMessage(error instanceof Error ? error.message : "Failed to enable Gmail live watch.")
      );
    } finally {
      setWatching(false);
    }
  }

  return (
    <div className="space-y-4 mt-5">
      <div className="rounded-[18px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
        <p className="eyebrow text-[9px] text-[var(--muted)]">Recommended · no forwarding required</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Connect your Gmail inbox</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Sign in with Google, approve Work Hat, and we handle sync, importing, and sending from this mailbox.
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
                {syncing ? "Importing..." : "Import latest email"}
              </button>
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-300">
                Connected
              </div>
              <button
                type="button"
                onClick={enableGmailWatch}
                disabled={watching}
                className="rounded-full border border-[var(--line-strong)] px-5 py-2.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[var(--moss)] disabled:opacity-50"
              >
                {watching ? "Repairing..." : "Repair live updates"}
              </button>
            </div>
          ) : (
            <a
              href={`/api/email/gmail/connect?returnTo=${encodeURIComponent("/onboarding?step=inbox")}`}
              className="rounded-full bg-[var(--moss)] px-5 py-2.5 text-center text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Sign in with Google
            </a>
          )}
        </div>

        {gmailConnection && (
          <div className="mt-4 rounded-[14px] border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-xs">
            <p className="font-medium">{gmailConnection.provider_account_email}</p>
            <p className="mt-1 text-[var(--muted)]">
              {gmailConnection.status === "connected" ? "Ready for shared inbox replies" : `Status: ${gmailConnection.status}`}
              {gmailConnection.sync_status ? ` · Sync: ${gmailConnection.sync_status}` : ""}
              {gmailConnection.last_sync_at ? ` · Last sync ${new Date(gmailConnection.last_sync_at).toLocaleString()}` : ""}
              {gmailConnection.watch_expires_at
                ? ` · Live updates active until ${new Date(gmailConnection.watch_expires_at).toLocaleDateString()}`
                : ""}
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

      <details className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--foreground)]">
          Need a fallback forwarding address?
        </summary>
        <p className="mt-3 text-xs leading-6 text-[var(--muted)]">
          Use this only if Google sign-in is unavailable. Every forwarded email creates a conversation automatically.
        </p>
        <div
          className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--sage)] px-4 py-3 font-mono text-sm"
          onClick={() => navigator.clipboard?.writeText(inboundAddress)}
          title="Click to copy"
        >
          <span>{inboundAddress}</span>
          <span className="text-[10px] text-[var(--muted)]">click to copy</span>
        </div>
      </details>
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
    description: "Sign in with Google so Work Hat can import and reply from your mailbox.",
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
  const [inboundAddress, setInboundAddress] = useState("inbound@work-hat.com");
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

  const loadExistingWorkspace = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/org");
      if (!res.ok) return;

      const data = await res.json() as SettingsOrgResponse;
      const slug = data.org?.slug ?? "";
      setOrgSlug(slug);
      setInboundAddress(data.channel?.inboundAddress || fallbackInboundAddress(slug));
      setOrgFields((prev) => ({
        orgName: data.org?.name || prev.orgName,
        supportEmail: data.channel?.supportEmail || prev.supportEmail,
        timezone: data.channel?.timezone || prev.timezone,
      }));
    } catch {
      // First-time users do not have settings yet. Step 1 creates them.
    }
  }, []);

  useEffect(() => {
    void loadExistingWorkspace();
  }, [loadExistingWorkspace]);

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
        const slug = data.org?.slug ?? "";
        setOrgSlug(slug);
        setInboundAddress(fallbackInboundAddress(slug));
        void loadExistingWorkspace();
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
    inbox: <StepInbox inboundAddress={inboundAddress || fallbackInboundAddress(orgSlug)} />,
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
