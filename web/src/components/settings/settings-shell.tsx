"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type OrgRecord = {
  id: string;
  name: string;
  slug: string;
  crm_plan: string;
  ai_plan: string;
};

type ChannelRecord = {
  supportEmail: string;
  fromName: string;
  timezone: string;
  inboundAddress: string;
};

type EmailConnection = {
  id: string;
  provider: string;
  provider_account_email: string | null;
  display_name: string | null;
  status: string;
  sync_status: string | null;
  token_expires_at: string | null;
  last_history_id: string | null;
  watch_expires_at: string | null;
  last_sync_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type EmailDiagnosticCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

type EmailDiagnostics = {
  checks: EmailDiagnosticCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
};

type TeamMember = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
};

type SettingsTab = "setup" | "organization" | "team" | "channels" | "ai" | "billing";

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "setup", label: "Setup wizard" },
  { id: "organization", label: "Organization" },
  { id: "team", label: "Team members" },
  { id: "channels", label: "Channels" },
  { id: "ai", label: "AI settings" },
  { id: "billing", label: "Billing" },
];

const roleLabel: Record<string, string> = {
  agent: "Agent",
  manager: "Manager",
  qa_reviewer: "QA reviewer",
  admin: "Admin",
};

// ── Shared UI components ───────────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5 ${className}`}>
      {children}
    </div>
  );
}

function FieldRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-[var(--line)] last:border-0">
      <div className="min-w-0 max-w-xs">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, disabled }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-64 rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors disabled:opacity-50"
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 rounded-full transition-colors ${checked ? "bg-[var(--moss)]" : "bg-[var(--sage)]"}`}
      aria-checked={checked}
      role="switch"
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}

// ── Setup tab ────────────────────────────────────────────────────────────────

function SetupTab({
  org,
  channel,
  team,
  onOpenTab,
  baseDir = "",
}: {
  org: OrgRecord | null;
  channel: ChannelRecord | null;
  team: TeamMember[];
  onOpenTab: (tab: SettingsTab) => void;
  baseDir?: string;
}) {
  const hasOrg = Boolean(org);
  const hasInboundAddress = Boolean(channel?.inboundAddress);
  const hasKnowledgePath = true;
  const hasTeam = team.length > 0;

  const steps = [
    {
      label: "Create workspace",
      description: hasOrg
        ? `Workspace ready: ${org?.name}`
        : "Create the organization record that anchors settings, people, and channels.",
      complete: hasOrg,
      action: () => onOpenTab("organization"),
      actionLabel: "Review organization",
    },
    {
      label: "Connect email channel",
      description: hasInboundAddress
        ? `Inbound address active: ${channel?.inboundAddress}`
        : "Generate the Work Hat forwarding address used to create inbox conversations.",
      complete: hasInboundAddress,
      action: () => onOpenTab("channels"),
      actionLabel: "Review channels",
    },
    {
      label: "Add knowledge",
      description: "Upload SOPs, tone rules, and policies so AI drafts have useful context.",
      complete: hasKnowledgePath,
      href: `${baseDir}/knowledge`,
      actionLabel: "Open knowledge",
    },
    {
      label: "Invite your team",
      description: hasTeam
        ? `${team.length} team member${team.length === 1 ? "" : "s"} connected.`
        : "Invite agents, managers, and reviewers so work can move through the queue.",
      complete: hasTeam,
      action: () => onOpenTab("team"),
      actionLabel: "Manage team",
    },
  ];

  const completedCount = steps.filter((step) => step.complete).length;
  const isBlocked = !hasOrg || !hasInboundAddress;

  return (
    <div className="space-y-5">
      <SectionCard className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--moss),rgba(144,50,61,0.1))]" />
        <p className="eyebrow text-[9px] text-[var(--muted)]">Workspace setup</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Finish your setup wizard</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
              This is the guided path for getting a new client workspace ready:
              organization, email channel, knowledge, then team access.
            </p>
          </div>
          <div className="shrink-0 rounded-[18px] border border-[var(--line)] bg-[var(--sage)] px-4 py-3 text-center">
            <p className="text-2xl font-semibold">{completedCount}/{steps.length}</p>
            <p className="eyebrow mt-0.5 text-[9px] text-[var(--muted)]">complete</p>
          </div>
        </div>

        {isBlocked && (
          <div className="mt-5 rounded-[18px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] p-4">
            <p className="text-sm font-semibold">Your setup is not complete yet</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              The email channel is missing, so Work Hat cannot create conversations from inbound mail yet.
              Run the onboarding wizard to generate the forwarding address.
            </p>
            <Link
              href={`${baseDir}/onboarding`}
              className="mt-3 inline-flex rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--moss-strong)]"
            >
              Open onboarding wizard
            </Link>
          </div>
        )}
      </SectionCard>

      <SectionCard className="p-0 overflow-hidden">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
              index < steps.length - 1 ? "border-b border-[var(--line)]" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                  step.complete
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                    : "border-[var(--line-strong)] bg-[var(--sage)] text-[var(--muted)]"
                }`}
              >
                {step.complete ? "✓" : index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold">{step.label}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{step.description}</p>
              </div>
            </div>
            {step.href ? (
              <Link
                href={step.href}
                className="shrink-0 rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]"
              >
                {step.actionLabel}
              </Link>
            ) : (
              <button
                onClick={step.action}
                className="shrink-0 rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]"
              >
                {step.actionLabel}
              </button>
            )}
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ── Organization tab ──────────────────────────────────────────────────────────

function OrgTab({
  org,
  channel,
  canEdit,
  onDirty,
  onSaveFields,
}: {
  org: OrgRecord | null;
  channel: ChannelRecord | null;
  canEdit: boolean;
  onDirty: () => void;
  onSaveFields: (fields: Record<string, string>) => void;
}) {
  const [name, setName] = useState(org?.name ?? "");
  const [supportEmail, setSupportEmail] = useState(channel?.supportEmail ?? "");
  const [fromName, setFromName] = useState(channel?.fromName ?? "");
  const [timezone, setTimezone] = useState(channel?.timezone ?? "America/New_York");

  function updateField(fieldName: "name" | "supportEmail" | "fromName" | "timezone", value: string) {
    const next = { name, supportEmail, fromName, timezone, [fieldName]: value };
    if (fieldName === "name") setName(value);
    if (fieldName === "supportEmail") setSupportEmail(value);
    if (fieldName === "fromName") setFromName(value);
    if (fieldName === "timezone") setTimezone(value);
    onDirty();
    onSaveFields(next);
  }

  return (
    <div className="space-y-5">
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Workspace</p>
        <div className="mt-1 divide-y divide-[var(--line)]">
          <FieldRow label="Organization name" description="Shown on invoices and team notifications.">
            <TextInput value={name} onChange={(v) => updateField("name", v)} disabled={!canEdit} />
          </FieldRow>
          <FieldRow label="Support email" description="Replies go out from this address.">
            <TextInput value={supportEmail} onChange={(v) => updateField("supportEmail", v)} disabled={!canEdit} />
          </FieldRow>
          <FieldRow label="From name" description="Shown in the customer's inbox.">
            <TextInput value={fromName} onChange={(v) => updateField("fromName", v)} disabled={!canEdit} />
          </FieldRow>
          <FieldRow label="Timezone" description="Used for SLA calculations.">
            <TextInput value={timezone} onChange={(v) => updateField("timezone", v)} disabled={!canEdit} />
          </FieldRow>
        </div>
      </SectionCard>

      {org && (
        <SectionCard>
          <p className="eyebrow text-[9px] text-[var(--muted)]">Account details</p>
          <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <p>Org slug: <span className="font-mono text-[var(--foreground)]">{org.slug}</span></p>
            <p>CRM plan: <span className="text-[var(--foreground)] capitalize">{org.crm_plan}</span></p>
            <p>AI plan: <span className="text-[var(--foreground)] capitalize">{org.ai_plan}</span></p>
          </div>
        </SectionCard>
      )}

      {canEdit && (
        <SectionCard>
          <p className="eyebrow text-[9px] text-[var(--muted)]">Danger zone</p>
          <div className="mt-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Delete organization</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Permanently removes all data, agents, and conversation history.
              </p>
            </div>
            <button className="rounded-full border border-[rgba(144,50,61,0.45)] px-4 py-2 text-xs font-medium text-[var(--moss)] transition-colors hover:bg-[rgba(144,50,61,0.12)]">
              Delete org
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Team tab ──────────────────────────────────────────────────────────────────

function TeamTab({
  initialMembers,
  callerId,
  canManage,
}: {
  initialMembers: TeamMember[];
  callerId: string;
  canManage: boolean;
}) {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"agent" | "manager" | "qa_reviewer">("agent");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function sendInvite() {
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: [inviteEmail.trim()], role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      setInviteMsg(`Invite sent to ${inviteEmail.trim()}.`);
      setInviteEmail("");
      // Optimistically add to list
      setMembers((prev) => [
        ...prev,
        {
          id: `pending-${Date.now()}`,
          full_name: inviteEmail.split("@")[0],
          email: inviteEmail.trim(),
          role: inviteRole,
          status: "pending",
        },
      ]);
    } catch (err) {
      setInviteMsg(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, role: string) {
    const res = await fetch(`/api/settings/team?userId=${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role } : m)));
    }
    setEditingId(null);
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this person from the org?")) return;
    const res = await fetch(`/api/settings/team?userId=${userId}`, { method: "DELETE" });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Team members</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Invite row */}
      {canManage && (
        <SectionCard>
          <p className="eyebrow text-[9px] text-[var(--muted)]">Invite a team member</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendInvite()}
              placeholder="teammate@company.com"
              className="flex-1 min-w-[200px] rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
            />
            <div className="flex gap-1">
              {(["agent", "manager", "qa_reviewer"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setInviteRole(r)}
                  className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                    inviteRole === r
                      ? "border-[var(--moss)] bg-[rgba(120,161,122,0.1)] text-[var(--foreground)]"
                      : "border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {r === "qa_reviewer" ? "QA" : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={sendInvite}
              disabled={inviting || !inviteEmail.includes("@")}
              className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50 transition-opacity"
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </div>
          {inviteMsg && (
            <p className="mt-2 text-xs text-[var(--muted)]">{inviteMsg}</p>
          )}
        </SectionCard>
      )}

      {/* Member list */}
      <SectionCard className="p-0 overflow-hidden">
        {members.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--muted)]">No team members yet.</div>
        ) : (
          members.map((member, i) => (
            <div
              key={member.id}
              className={`flex items-center justify-between gap-4 px-5 py-4 ${
                i < members.length - 1 ? "border-b border-[var(--line)]" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sage)] text-xs font-semibold">
                  {member.full_name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <p className="text-sm font-medium">{member.full_name}</p>
                  <p className="text-xs text-[var(--muted)]">{member.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {editingId === member.id ? (
                  <div className="flex gap-1">
                    {["agent", "manager", "qa_reviewer", "admin"].map((r) => (
                      <button
                        key={r}
                        onClick={() => changeRole(member.id, r)}
                        className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                          member.role === r
                            ? "border-[var(--moss)] bg-[rgba(120,161,122,0.1)]"
                            : "border-[var(--line-strong)] text-[var(--muted)]"
                        }`}
                      >
                        {roleLabel[r]}
                      </button>
                    ))}
                    <button onClick={() => setEditingId(null)} className="text-[10px] text-[var(--muted)] ml-1">✕</button>
                  </div>
                ) : (
                  <>
                    <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]">
                      {roleLabel[member.role] ?? member.role}
                    </span>
                    {member.status === "pending" ? (
                      <span className="rounded-full bg-[rgba(169,146,125,0.15)] border border-[rgba(169,146,125,0.3)] px-2.5 py-1 text-[10px] text-[var(--muted)]">
                        Invited
                      </span>
                    ) : (
                      <span className="status-dot status-dot-green" />
                    )}
                    {canManage && member.id !== callerId && (
                      <>
                        <button
                          onClick={() => setEditingId(member.id)}
                          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                        >
                          Role
                        </button>
                        <button
                          onClick={() => removeMember(member.id)}
                          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </SectionCard>

      {/* Role reference */}
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Roles</p>
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] shrink-0">Agent</span>
            <p className="text-[var(--muted)]">Handles conversations, uses AI drafts, posts internal notes. Cannot access analytics or QA review.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] shrink-0">Manager</span>
            <p className="text-[var(--muted)]">All agent permissions plus Dashboard, edit analyzer, QA queue, and knowledge base editing.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] shrink-0">QA reviewer</span>
            <p className="text-[var(--muted)]">Read-only access to threads and edit analysis. Can add review comments and flag patterns.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] shrink-0">Admin</span>
            <p className="text-[var(--muted)]">Full access including org settings, team management, billing, and channel configuration.</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Channels tab ──────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="shrink-0 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-[10px] font-medium transition-colors hover:border-[var(--moss)]"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function ChannelsTab({ channel, canEdit, onDirty }: { channel: ChannelRecord | null; canEdit: boolean; onDirty: () => void }) {
  const [fromName, setFromName] = useState(channel?.fromName ?? "");
  const [setupPath, setSetupPath] = useState<"gmail" | "direct" | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const [connectionAction, setConnectionAction] = useState<"sync" | "watch" | "disconnect" | null>(null);
  const [diagnostics, setDiagnostics] = useState<EmailDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  const inboundAddress = channel?.inboundAddress || "";
  const hasAddress = Boolean(inboundAddress);
  const primaryConnection = connections.find((connection) => connection.status === "connected") ?? connections[0] ?? null;
  const isConnected = primaryConnection?.status === "connected";

  useEffect(() => {
    void refreshConnections();
    void refreshDiagnostics();
  }, []);

  async function refreshConnections() {
    setConnectionsLoading(true);
    setConnectionError(null);
    try {
      const res = await fetch("/api/email/connections");
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Could not load email connections.");
      }
      setConnections(Array.isArray(payload.connections) ? payload.connections : []);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not load email connections.");
    } finally {
      setConnectionsLoading(false);
    }
  }

  async function refreshDiagnostics() {
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      const res = await fetch("/api/email/gmail/diagnostics");
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Could not load Gmail diagnostics.");
      }
      setDiagnostics(payload as EmailDiagnostics);
    } catch (error) {
      setDiagnosticsError(error instanceof Error ? error.message : "Could not load Gmail diagnostics.");
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  async function runConnectionAction(action: "sync" | "watch") {
    setConnectionAction(action);
    setConnectionError(null);
    setConnectionNotice(null);
    try {
      const res = await fetch(action === "sync" ? "/api/email/gmail/sync" : "/api/email/gmail/watch", { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? `Could not ${action === "sync" ? "sync Gmail" : "start live watch"}.`);
      }
      setConnectionNotice(action === "sync" ? "Gmail sync finished. New mail should now appear in the inbox." : "Live Gmail watch is active.");
      await refreshConnections();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Connection action failed.");
    } finally {
      setConnectionAction(null);
    }
  }

  async function disconnectConnection() {
    if (!primaryConnection) return;
    setConnectionAction("disconnect");
    setConnectionError(null);
    setConnectionNotice(null);
    try {
      const res = await fetch(`/api/email/connections?connectionId=${primaryConnection.id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Could not disconnect Gmail.");
      }
      setConnectionNotice("Gmail has been disconnected. You can reconnect whenever you are ready.");
      await refreshConnections();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not disconnect Gmail.");
    } finally {
      setConnectionAction(null);
    }
  }

  function formatTimestamp(value: string | null) {
    if (!value) return "Not available";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  async function sendTestEmail() {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactEmail: "test@example.com",
          contactName: "Test Customer",
          subject: "Test conversation — channel verification",
          firstMessage: "This is an automated test message to verify your Work Hat inbox is configured correctly. You can delete this conversation.",
          intent: "support",
        }),
      });
      setTestResult(res.ok ? "success" : "error");
    } catch {
      setTestResult("error");
    }
    setTestSending(false);
  }

  return (
    <div className="space-y-5">
      <SectionCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="eyebrow text-[9px] text-[var(--muted)]">Recommended</p>
            <p className="mt-1 text-base font-semibold">Work Hat Gmail connector</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">
              Connect Gmail directly so Work Hat can import conversations, keep a live watch, and send replies from the same mailbox.
              Forwarding stays available as a fallback.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Link
                href="/api/email/gmail/connect"
                className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                {isConnected ? "Reconnect Gmail" : "Connect Gmail"}
              </Link>
            ) : (
              <span className="rounded-full border border-[var(--line)] px-4 py-2 text-xs text-[var(--muted)]">
                Admin access required
              </span>
            )}
            <button
              onClick={refreshConnections}
              disabled={connectionsLoading}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--line-strong)] disabled:opacity-50"
            >
              {connectionsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-[18px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-4">
          {connectionsLoading && <p className="text-sm text-[var(--muted)]">Checking Gmail connector status...</p>}

          {!connectionsLoading && !primaryConnection && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">No Gmail account connected yet</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Once connected, this panel will show sync health, live watch status, and the mailbox used for replies.
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[rgba(144,50,61,0.45)] px-3 py-1.5 text-xs text-[var(--muted)]">
                <span className="h-2 w-2 rounded-full bg-[var(--moss)] opacity-40" />
                Not connected
              </span>
            </div>
          )}

          {!connectionsLoading && primaryConnection && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{primaryConnection.provider_account_email ?? "Gmail account"}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                      isConnected ? "bg-emerald-400/10 text-emerald-300" : "bg-[rgba(144,50,61,0.16)] text-[var(--muted)]"
                    }`}>
                      {primaryConnection.status}
                    </span>
                    {primaryConnection.sync_status && (
                      <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] text-[var(--muted)]">
                        Sync: {primaryConnection.sync_status}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    {primaryConnection.display_name || "Primary support mailbox"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => runConnectionAction("sync")}
                    disabled={!canEdit || !isConnected || connectionAction !== null}
                    className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-45"
                  >
                    {connectionAction === "sync" ? "Syncing..." : "Sync now"}
                  </button>
                  <button
                    onClick={() => runConnectionAction("watch")}
                    disabled={!canEdit || !isConnected || connectionAction !== null}
                    className="rounded-full border border-[var(--line)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--line-strong)] disabled:opacity-45"
                  >
                    {connectionAction === "watch" ? "Starting..." : "Start live watch"}
                  </button>
                  <button
                    onClick={disconnectConnection}
                    disabled={!canEdit || !isConnected || connectionAction !== null}
                    className="rounded-full border border-[rgba(144,50,61,0.45)] px-4 py-2 text-xs font-medium text-[rgba(255,190,190,0.9)] transition-colors hover:border-[rgba(144,50,61,0.75)] disabled:opacity-45"
                  >
                    {connectionAction === "disconnect" ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ConnectorMetric label="Last sync" value={formatTimestamp(primaryConnection.last_sync_at)} />
                <ConnectorMetric label="Live watch expires" value={formatTimestamp(primaryConnection.watch_expires_at)} />
                <ConnectorMetric label="Token expires" value={formatTimestamp(primaryConnection.token_expires_at)} />
                <ConnectorMetric label="Gmail history" value={primaryConnection.last_history_id ?? "Not started"} />
              </div>

              {primaryConnection.error_message && (
                <div className="rounded-[14px] border border-[rgba(144,50,61,0.4)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-xs leading-5 text-[rgba(255,210,210,0.9)]">
                  {primaryConnection.error_message}
                </div>
              )}
            </div>
          )}

          {connectionNotice && (
            <div className="mt-4 rounded-[14px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-200">
              {connectionNotice}
            </div>
          )}
          {connectionError && (
            <div className="mt-4 rounded-[14px] border border-[rgba(144,50,61,0.4)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-xs leading-5 text-[rgba(255,210,210,0.9)]">
              {connectionError}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow text-[9px] text-[var(--muted)]">System readiness</p>
            <p className="mt-1 text-base font-semibold">Gmail connector diagnostics</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">
              These checks confirm the production environment has the server-only keys needed for OAuth, encrypted token storage,
              live Gmail push, and watch renewal.
            </p>
          </div>
          <button
            onClick={refreshDiagnostics}
            disabled={diagnosticsLoading}
            className="w-fit rounded-full border border-[var(--line)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--line-strong)] disabled:opacity-50"
          >
            {diagnosticsLoading ? "Checking..." : "Recheck"}
          </button>
        </div>

        <div className="mt-4">
          {diagnosticsLoading && <p className="text-sm text-[var(--muted)]">Checking connector configuration...</p>}
          {diagnosticsError && (
            <div className="rounded-[14px] border border-[rgba(144,50,61,0.4)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-xs leading-5 text-[rgba(255,210,210,0.9)]">
              {diagnosticsError}
            </div>
          )}
          {!diagnosticsLoading && diagnostics && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <DiagnosticPill status="pass" label={`${diagnostics.summary.pass} ready`} />
                <DiagnosticPill status="warn" label={`${diagnostics.summary.warn} warnings`} />
                <DiagnosticPill status="fail" label={`${diagnostics.summary.fail} missing`} />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {diagnostics.checks.map((check) => (
                  <div key={check.key} className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{check.label}</p>
                      <DiagnosticPill status={check.status} label={check.status} />
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{check.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Your inbound address */}
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Email channel</p>
        <p className="mt-1 text-base font-semibold">Your inbound address</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          Every email sent to this address creates a conversation in your inbox.
          You can use it directly or forward your existing support email here.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <code className="flex-1 rounded-[12px] border border-[var(--line)] bg-[var(--sage)] px-4 py-2.5 text-sm font-mono text-[var(--foreground)] overflow-x-auto">
            {hasAddress ? inboundAddress : "Complete onboarding to get your address"}
          </code>
          {hasAddress && <CopyButton value={inboundAddress} />}
        </div>

        {!hasAddress && (
          <div className="mt-4 rounded-[16px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] p-4">
            <p className="text-sm font-semibold">No setup wizard has been completed yet</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Run onboarding to create or repair the email channel and generate your inbound forwarding address.
            </p>
            <Link
              href="/onboarding"
              className="mt-3 inline-flex rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--moss-strong)]"
            >
              Open setup wizard
            </Link>
          </div>
        )}

        {hasAddress && (
          <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--muted)]">
            <span className="status-dot status-dot-green" />
            Address is active — emails sent here will appear in your inbox
          </div>
        )}
      </SectionCard>

      {/* Setup guide */}
      {hasAddress && (
        <SectionCard>
          <p className="eyebrow text-[9px] text-[var(--muted)]">Setup guide</p>
          <p className="mt-1 text-base font-semibold">Connect your support email</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Choose how you want to route emails into Work Hat. No technical setup required on your end.
          </p>

          {/* Path selector */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setSetupPath(setupPath === "gmail" ? null : "gmail")}
              className={`rounded-[18px] border p-4 text-left transition-colors ${
                setupPath === "gmail"
                  ? "border-[var(--moss)] bg-[rgba(144,50,61,0.06)]"
                  : "border-[var(--line)] hover:border-[var(--line-strong)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-[var(--line)] bg-[var(--sage)] text-sm">G</div>
                <p className="text-sm font-semibold">Gmail / Google Workspace</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                Forward your existing support@ or hello@ email here. Takes 2 minutes.
              </p>
            </button>

            <button
              onClick={() => setSetupPath(setupPath === "direct" ? null : "direct")}
              className={`rounded-[18px] border p-4 text-left transition-colors ${
                setupPath === "direct"
                  ? "border-[var(--moss)] bg-[rgba(144,50,61,0.06)]"
                  : "border-[var(--line)] hover:border-[var(--line-strong)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-[var(--line)] bg-[var(--sage)] text-sm">✉</div>
                <p className="text-sm font-semibold">Use address directly</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                Share your Work Hat address as your support email. Simplest setup.
              </p>
            </button>
          </div>

          {/* Gmail instructions */}
          {setupPath === "gmail" && (
            <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
              <p className="text-sm font-semibold">Forward Gmail to Work Hat</p>
              <ol className="mt-4 space-y-4">
                {[
                  {
                    step: "1",
                    title: "Open Gmail Settings",
                    body: "In Gmail, click the gear icon → See all settings → Forwarding and POP/IMAP tab.",
                  },
                  {
                    step: "2",
                    title: "Add a forwarding address",
                    body: "Click \"Add a forwarding address\" and enter your Work Hat inbound address:",
                    code: inboundAddress,
                  },
                  {
                    step: "3",
                    title: "Confirm the forwarding email",
                    body: "Google sends a confirmation email. The verification link will appear as a conversation in your Work Hat inbox — open it and click the link.",
                  },
                  {
                    step: "4",
                    title: "Enable forwarding",
                    body: "Back in Gmail settings, select \"Forward a copy of incoming mail\" and choose your Work Hat address. Save.",
                  },
                ].map((s) => (
                  <li key={s.step} className="flex gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--moss)] text-[10px] font-semibold text-white">
                      {s.step}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{s.body}</p>
                      {s.code && (
                        <div className="mt-2 flex items-center gap-2">
                          <code className="flex-1 overflow-x-auto rounded-[10px] border border-[var(--line)] bg-[var(--sage)] px-3 py-2 text-xs font-mono">
                            {s.code}
                          </code>
                          <CopyButton value={s.code} />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-5 rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                <p className="text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest">Google Workspace</p>
                <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
                  For Workspace accounts, go to Admin console → Apps → Google Workspace → Gmail → Routing →
                  Add a routing rule to forward matching emails to your Work Hat address.
                </p>
              </div>
            </div>
          )}

          {/* Direct use instructions */}
          {setupPath === "direct" && (
            <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
              <p className="text-sm font-semibold">Use your Work Hat address directly</p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                Share this address anywhere customers can reach you — email signature, website, helpdesk widget, auto-replies.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-[10px] border border-[var(--line)] bg-[var(--sage)] px-3 py-2 text-xs font-mono">
                  {inboundAddress}
                </code>
                <CopyButton value={inboundAddress} />
              </div>
              <div className="mt-4 space-y-2">
                {[
                  "Add it to your email signature as your support address",
                  "Replace support@yourcompany.com in your website contact form",
                  "Use it as the reply-to in your product's notification emails",
                  "Add it to your Calendly or onboarding flows",
                ].map((tip) => (
                  <div key={tip} className="flex items-start gap-2 text-xs">
                    <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--moss)]" />
                    <span className="text-[var(--muted)]">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Test connection */}
      {hasAddress && (
        <SectionCard>
          <p className="eyebrow text-[9px] text-[var(--muted)]">Test</p>
          <p className="mt-1 text-base font-semibold">Verify your inbox works</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Create a test conversation to confirm your inbox is receiving messages and the AI draft is working.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={sendTestEmail}
              disabled={testSending}
              className="rounded-full bg-[var(--moss)] px-5 py-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {testSending ? "Creating test…" : "Send test conversation"}
            </button>
            {testResult === "success" && (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <span className="status-dot status-dot-green" />
                Test conversation created — check your inbox
              </div>
            )}
            {testResult === "error" && (
              <p className="text-xs text-[rgba(220,80,80,0.9)]">Something went wrong. Try again.</p>
            )}
          </div>
        </SectionCard>
      )}

      {/* From name */}
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Outbound</p>
        <div className="divide-y divide-[var(--line)]">
          <FieldRow label="From name" description="Name shown in your customer's inbox when you reply.">
            <TextInput value={fromName} onChange={(v) => { setFromName(v); onDirty(); }} disabled={!canEdit} />
          </FieldRow>
        </div>
      </SectionCard>

      {/* Roadmap */}
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Roadmap</p>
        <p className="mt-1 text-sm font-semibold">More channels coming</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {["SMS / Twilio", "Live chat widget", "Outlook / Microsoft 365", "Slack Connect"].map((ch) => (
            <div key={ch} className="rounded-[14px] border border-[var(--line)] px-4 py-3 opacity-50">
              <p className="text-sm font-medium">{ch}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">On the roadmap</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function ConnectorMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-3 py-3">
      <p className="eyebrow text-[8px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words text-xs text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function DiagnosticPill({ status, label }: { status: EmailDiagnosticCheck["status"]; label: string }) {
  const className =
    status === "pass"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : status === "warn"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
      : "border-[rgba(144,50,61,0.45)] bg-[rgba(73,17,28,0.22)] text-[rgba(255,210,210,0.95)]";

  return (
    <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[10px] font-medium capitalize ${className}`}>
      {label}
    </span>
  );
}

// ── AI tab ────────────────────────────────────────────────────────────────────

function AiTab({ onDirty }: { onDirty: () => void }) {
  const [autoDraft, setAutoDraft] = useState(true);
  const [showAgents, setShowAgents] = useState(true);
  const [requireConfirm, setRequireConfirm] = useState(true);
  const [showAnalyzer, setShowAnalyzer] = useState(false);
  const [model, setModel] = useState("gpt-4o");

  const toggle = (setter: (v: boolean) => void) => (v: boolean) => { setter(v); onDirty(); };

  return (
    <div className="space-y-5">
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Draft generation</p>
        <div className="mt-1 divide-y divide-[var(--line)]">
          <FieldRow label="Generate drafts automatically" description="AI prepares a draft for every new inbound message.">
            <Toggle checked={autoDraft} onChange={toggle(setAutoDraft)} />
          </FieldRow>
          <FieldRow label="Show drafts to agents" description="Agents see the draft before deciding to use it.">
            <Toggle checked={showAgents} onChange={toggle(setShowAgents)} />
          </FieldRow>
          <FieldRow label="Require confirmation before send" description="No AI reply goes out without explicit agent approval.">
            <Toggle checked={requireConfirm} onChange={toggle(setRequireConfirm)} />
          </FieldRow>
          <FieldRow label="Show edit analyzer to agents" description="Agents see edit type and intensity after sending.">
            <Toggle checked={showAnalyzer} onChange={toggle(setShowAnalyzer)} />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Model</p>
        <div className="mt-1 divide-y divide-[var(--line)]">
          <FieldRow label="Draft model" description="Used for reply generation.">
            <TextInput value={model} onChange={(v) => { setModel(v); onDirty(); }} />
          </FieldRow>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Billing tab ───────────────────────────────────────────────────────────────

function BillingTab({ org }: { org: OrgRecord | null }) {
  return (
    <div className="space-y-5">
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Current plan</p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-semibold capitalize">{org?.crm_plan ?? "Starter"}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Manage your plan and billing in the billing portal.
            </p>
          </div>
          <button className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]">
            Manage billing
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────────

export function SettingsShell({
  org,
  channel,
  team,
  callerRole,
  callerId,
  isDemo = false,
  baseDir = "",
}: {
  org: OrgRecord | null;
  channel: ChannelRecord | null;
  team: TeamMember[];
  callerRole: string;
  callerId: string;
  isDemo?: boolean;
  baseDir?: string;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    org && channel?.inboundAddress ? "organization" : "setup"
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [saveFields, setSaveFields] = useState<Record<string, string>>({});

  const isAdmin = callerRole === "admin";
  const canManageTeam = isAdmin || callerRole === "manager";

  async function handleSave() {
    setSaveStatus("saving");
    
    // In demo mode, we just simulate saving
    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setSaveStatus("saved");
      setIsDirty(false);
      setTimeout(() => setSaveStatus("idle"), 2500);
      return;
    }

    try {
      const res = await fetch("/api/settings/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveFields),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveStatus("saved");
      setIsDirty(false);
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("idle");
    }
  }

  const tabContent: Record<SettingsTab, React.ReactNode> = {
    setup: (
      <SetupTab
        org={org}
        channel={channel}
        team={team}
        onOpenTab={setActiveTab}
        baseDir={baseDir}
      />
    ),
    organization: (
      <OrgTab
        org={org}
        channel={channel}
        canEdit={isAdmin}
        onDirty={() => setIsDirty(true)}
        onSaveFields={(f) => setSaveFields((prev) => ({ ...prev, ...f }))}
      />
    ),
    team: (
      <TeamTab
        initialMembers={team}
        callerId={callerId}
        canManage={canManageTeam}
      />
    ),
    channels: <ChannelsTab channel={channel} canEdit={isAdmin} onDirty={() => setIsDirty(true)} />,
    ai: <AiTab onDirty={() => setIsDirty(true)} />,
    billing: <BillingTab org={org} />,
  };

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-[var(--line)] p-3">
        <div className="px-3 py-3">
          <h1 className="text-sm font-semibold">Settings</h1>
          {org && <p className="mt-0.5 text-xs text-[var(--muted)] truncate">{org.name}</p>}
        </div>
        <nav className="flex flex-col gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-[var(--sage)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:bg-[var(--sage)] hover:text-[var(--foreground)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="scroll-soft flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-2xl">{tabContent[activeTab]}</div>
        </div>

        {/* Save bar — only shown for tabs with editable fields */}
        {activeTab !== "team" && activeTab !== "billing" && (
          <div className={`shrink-0 border-t border-[var(--line)] px-6 py-4 transition-opacity ${isDirty || saveStatus === "saved" ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
              <p className="text-xs text-[var(--muted)]">
                {saveStatus === "saved" ? "All changes saved." : isDirty ? "You have unsaved changes." : "No unsaved changes."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setIsDirty(false); setSaveStatus("idle"); }}
                  disabled={!isDirty || saveStatus === "saving"}
                  className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium disabled:opacity-40 transition-opacity"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!isDirty || saveStatus === "saving"}
                  className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50 transition-opacity min-w-[96px]"
                >
                  {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
