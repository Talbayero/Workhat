"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmailConnectionSetup } from "@/components/email/email-connection-setup";

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

type SlaPolicyRecord = {
  enabled: boolean;
  first_response_minutes: number;
  next_response_minutes: number;
  at_risk_threshold_minutes: number;
  business_hours_json: Record<string, unknown>;
};

type EmailConnection = {
  id: string;
  provider: string;
  connection_type?: string | null;
  provider_account_email: string | null;
  display_name: string | null;
  status: string;
  sync_status: string | null;
  token_expires_at: string | null;
  last_history_id: string | null;
  watch_expires_at: string | null;
  last_sync_at: string | null;
  inbound_enabled?: boolean | null;
  outbound_enabled?: boolean | null;
  last_validated_at?: string | null;
  last_inbound_sync_at?: string | null;
  last_outbound_send_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  diagnostics_json?: Record<string, unknown> | null;
  credential_metadata?: Record<string, unknown> | null;
  error_message: string | null;
  provider_metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type CustomInboundChannel = {
  id: string;
  status: string;
  name: string;
  fromName: string;
  replyIdentity: string;
  inboundAddress: string | null;
  webhookEndpoint: string;
  webhookSecret: string | null;
  webhookSecretHint: string | null;
  lastInboundAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastEvent: {
    status: string;
    received_at: string;
    error_message: string | null;
  } | null;
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

type SetupHealth = {
  checks: EmailDiagnosticCheck[];
  summary: {
    googleOAuthConfigured: boolean;
    googleRedirectUri: string | null;
    googleRedirectUriConfirmed: boolean;
    encryptionConfigured: boolean;
    serverDatabaseConfigured: boolean;
    credentialMailboxConfigured: boolean;
    customInboundConfigured: boolean;
    redisConfigured: boolean;
    activeInboundAdapterAvailable: boolean;
    activeOutboundAdapterAvailable: boolean;
    missingRequiredEnv: string[];
    nextAction: string;
  };
};

type AgentSkill = { name: string; priority: number };

type TeamMember = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  skills?: AgentSkill[];
};

type SettingsTab = "setup" | "organization" | "team" | "channels" | "sla" | "ai" | "intents" | "billing";

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "setup", label: "Setup wizard" },
  { id: "organization", label: "Organization" },
  { id: "team", label: "Team members" },
  { id: "channels", label: "Channels" },
  { id: "sla", label: "SLA policy" },
  { id: "ai", label: "AI settings" },
  { id: "intents", label: "Intents" },
  { id: "billing", label: "Billing" },
];

const roleLabel: Record<string, string> = {
  agent: "Agent",
  manager: "Manager",
  qa_reviewer: "QA reviewer",
  admin: "Admin",
};

function friendlyEmailConnectorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("google_client") ||
    normalized.includes("google oauth is not configured") ||
    normalized.includes("server key") ||
    normalized.includes("admin database")
  ) {
    return "Google OAuth is not configured by your workspace admin.";
  }

  if (normalized.includes("email_token_encryption_key") || normalized.includes("mailbox token encryption")) {
    return "Mailbox token encryption is not configured by your workspace admin.";
  }

  if (normalized.includes("denied") || normalized.includes("not approved") || normalized.includes("cancelled")) {
    return "Google sign-in was cancelled or access was not approved. Please try again when you are ready.";
  }

  if (normalized.includes("expired")) {
    return "Your Google sign-in session expired. Please try again.";
  }

  return message;
}

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
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] ${checked ? "bg-[var(--moss)]" : "bg-[var(--sage)]"}`}
      aria-checked={checked}
      role="switch"
    >
      <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

// ── Skill editor (used inside TeamTab) ───────────────────────────────────────

const PRIORITY_LABELS: Record<number, string> = {
  1: "Primary",
  2: "Strong",
  3: "Moderate",
  4: "Secondary",
  5: "Backup",
};

function SkillEditor({
  memberId,
  memberName,
  initialSkills,
  onClose,
}: {
  memberId: string;
  memberName: string;
  initialSkills: AgentSkill[];
  onClose: (updated?: AgentSkill[]) => void;
}) {
  const [skills, setSkills] = useState<AgentSkill[]>(initialSkills);
  const [newSkill, setNewSkill] = useState("");
  const [newPriority, setNewPriority] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addSkill() {
    const name = newSkill.trim().toLowerCase();
    if (!name) return;
    if (skills.some((s) => s.name === name)) {
      setError("Skill already added.");
      return;
    }
    setSkills((prev) => [...prev, { name, priority: newPriority }].sort((a, b) => a.priority - b.priority));
    setNewSkill("");
    setNewPriority(3);
    setError(null);
  }

  function removeSkill(name: string) {
    setSkills((prev) => prev.filter((s) => s.name !== name));
  }

  function updatePriority(name: string, priority: number) {
    setSkills((prev) =>
      prev.map((s) => (s.name === name ? { ...s, priority } : s)).sort((a, b) => a.priority - b.priority)
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/team?userId=${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Save failed");
      }
      onClose(skills);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-[18px] border border-[var(--line)] bg-[var(--sage)] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Skills — {memberName}</p>
        <button onClick={() => onClose()} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">✕</button>
      </div>

      {/* Existing skills */}
      {skills.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No skills assigned yet.</p>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div key={skill.name} className="flex items-center gap-2">
              <span className="flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs font-medium capitalize">
                {skill.name}
              </span>
              <select
                value={skill.priority}
                onChange={(e) => updatePriority(skill.name, Number(e.target.value))}
                className="rounded-[10px] border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs text-[var(--foreground)] outline-none"
              >
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>{p} — {PRIORITY_LABELS[p]}</option>
                ))}
              </select>
              <button
                onClick={() => removeSkill(skill.name)}
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new skill */}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSkill()}
          placeholder="e.g. finance, back office"
          className="flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)]"
        />
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(Number(e.target.value))}
          className="rounded-[10px] border border-[var(--line)] bg-[var(--panel-strong)] px-2 py-1.5 text-xs text-[var(--foreground)] outline-none"
        >
          {[1, 2, 3, 4, 5].map((p) => (
            <option key={p} value={p}>{p} — {PRIORITY_LABELS[p]}</option>
          ))}
        </select>
        <button
          onClick={addSkill}
          disabled={!newSkill.trim()}
          className="rounded-full bg-[var(--moss)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {error && <p className="text-xs text-[rgba(220,80,80,0.9)]">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={() => onClose()} className="rounded-full border border-[var(--line-strong)] px-4 py-1.5 text-xs font-medium">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-[var(--moss)] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save skills"}
        </button>
      </div>
    </div>
  );
}

// ── Setup tab ────────────────────────────────────────────────────────────────

function SetupTab({
  org,
  channel,
  team,
  mailboxReady,
  onOpenTab,
  baseDir = "",
}: {
  org: OrgRecord | null;
  channel: ChannelRecord | null;
  team: TeamMember[];
  mailboxReady: boolean;
  onOpenTab: (tab: SettingsTab) => void;
  baseDir?: string;
}) {
  const hasOrg = Boolean(org);
  const hasInboundAddress = Boolean(channel?.inboundAddress);
  const hasInboundMailbox = mailboxReady || hasInboundAddress;
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
      description: mailboxReady
        ? "Active mailbox ready for inbound polling and approved replies."
        : hasInboundAddress
        ? `Fallback inbound address active: ${channel?.inboundAddress}`
        : "Connect and validate a mailbox or generate the fallback inbound address.",
      complete: hasInboundMailbox,
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
  const isBlocked = !hasOrg || !hasInboundMailbox;

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
              No active inbound mailbox or fallback inbound address is ready yet.
              Connect and validate a mailbox, or run onboarding to generate the fallback inbound address.
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
  const [editingSkillsId, setEditingSkillsId] = useState<string | null>(null);

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
                    {/* Skill pills */}
                    {(member.skills ?? []).slice(0, 2).map((s) => (
                      <span
                        key={s.name}
                        className="rounded-full border border-[rgba(120,161,122,0.35)] bg-[rgba(120,161,122,0.08)] px-2.5 py-1 text-[10px] capitalize text-[var(--muted)]"
                      >
                        {s.name}
                      </span>
                    ))}
                    {(member.skills ?? []).length > 2 && (
                      <span className="text-[10px] text-[var(--muted)]">+{(member.skills ?? []).length - 2}</span>
                    )}
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
                          onClick={() => setEditingSkillsId(editingSkillsId === member.id ? null : member.id)}
                          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                        >
                          Skills
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

              {/* Inline skill editor */}
              {editingSkillsId === member.id && (
                <div className="px-5 pb-4">
                  <SkillEditor
                    memberId={member.id}
                    memberName={member.full_name}
                    initialSkills={member.skills ?? []}
                    onClose={(updated) => {
                      setEditingSkillsId(null);
                      if (updated) {
                        setMembers((prev) =>
                          prev.map((m) => (m.id === member.id ? { ...m, skills: updated } : m))
                        );
                      }
                    }}
                  />
                </div>
              )}
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
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [customChannels, setCustomChannels] = useState<CustomInboundChannel[]>([]);
  const [customName, setCustomName] = useState("Work Hat internal inbound");
  const [customFromName, setCustomFromName] = useState("");
  const [customReplyIdentity, setCustomReplyIdentity] = useState("");
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const [connectionAction, setConnectionAction] = useState<"sync" | "watch" | "disconnect" | null>(null);
  const [customAction, setCustomAction] = useState<"create" | "update" | "regenerate" | null>(null);
  const [diagnostics, setDiagnostics] = useState<EmailDiagnostics | null>(null);
  const [setupHealth, setSetupHealth] = useState<SetupHealth | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  const inboundAddress = channel?.inboundAddress || "";
  const hasAddress = Boolean(inboundAddress);
  const primaryConnection = connections.find((connection) => connection.status === "active" || connection.status === "connected") ?? connections[0] ?? null;
  const isConnected = primaryConnection?.status === "active" || primaryConnection?.status === "connected";
  const isGmailOauth = primaryConnection?.provider === "gmail" && primaryConnection.connection_type === "oauth";
  const customChannel = customChannels[0] ?? null;

  useEffect(() => {
    void refreshConnections();
    void refreshDiagnostics();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const emailError = params.get("emailError");

    if (connected === "gmail") {
      setConnectionNotice("Gmail connected. Work Hat can now import conversations and send replies from that mailbox.");
      void refreshConnections();
    } else if (emailError) {
      setConnectionError(friendlyEmailConnectorMessage(emailError));
    }
  }, []);

  async function refreshConnections() {
    setConnectionsLoading(true);
    setConnectionError(null);
    try {
      const [connectionsRes, customRes] = await Promise.all([
        fetch("/api/email/connections"),
        fetch("/api/email/custom-inbound"),
      ]);
      const connectionsPayload = await connectionsRes.json().catch(() => ({}));
      const customPayload = await customRes.json().catch(() => ({}));
      if (!connectionsRes.ok) {
        throw new Error(connectionsPayload.error ?? "Could not load email connections.");
      }
      if (!customRes.ok) {
        throw new Error(customPayload.error ?? "Could not load custom inbound channels.");
      }
      const nextConnections = Array.isArray(connectionsPayload.connections) ? connectionsPayload.connections : [];
      const nextCustom = Array.isArray(customPayload.channels) ? customPayload.channels : [];
      setConnections(nextConnections);
      setCustomChannels(nextCustom);
      const firstCustom = nextCustom[0] as CustomInboundChannel | undefined;
      if (firstCustom) {
        setCustomName(firstCustom.name || "Custom inbound");
        setCustomFromName(firstCustom.fromName || "");
        setCustomReplyIdentity(firstCustom.replyIdentity || "");
      }
    } catch (error) {
      setConnectionError(
        friendlyEmailConnectorMessage(error instanceof Error ? error.message : "Could not load email connections.")
      );
    } finally {
      setConnectionsLoading(false);
    }
  }

  async function saveCustomInbound(action: "create" | "update" | "regenerate") {
    if (action !== "create" && !customChannel) return;
    setCustomAction(action);
    setConnectionError(null);
    setConnectionNotice(null);
    try {
      const res = await fetch("/api/email/custom-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          channelId: customChannel?.id,
          name: customName,
          fromName: customFromName,
          replyIdentity: customReplyIdentity,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Could not save custom inbound channel.");
      }
      if (payload.channel) {
        setCustomChannels([payload.channel]);
        setCustomName(payload.channel.name || customName);
        setCustomFromName(payload.channel.fromName || "");
        setCustomReplyIdentity(payload.channel.replyIdentity || "");
      }
      setConnectionNotice(
        action === "regenerate"
          ? "Custom inbound token regenerated. Update your relay with the new token before sending more mail."
          : "Custom inbound channel saved."
      );
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not save custom inbound channel.");
    } finally {
      setCustomAction(null);
    }
  }

  async function refreshDiagnostics() {
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      const [diagnosticsRes, setupRes] = await Promise.all([
        fetch("/api/email/mailbox/diagnostics"),
        fetch("/api/system/setup-health"),
      ]);
      const payload = await diagnosticsRes.json().catch(() => ({}));
      const setupPayload = await setupRes.json().catch(() => ({}));
      if (!diagnosticsRes.ok) {
        throw new Error(payload.error ?? "Could not load mailbox diagnostics.");
      }
      if (setupRes.ok) setSetupHealth(setupPayload as SetupHealth);
      setDiagnostics(payload as EmailDiagnostics);
    } catch (error) {
      setDiagnosticsError(error instanceof Error ? error.message : "Could not load mailbox diagnostics.");
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  async function runConnectionAction(action: "sync" | "watch") {
    setConnectionAction(action);
    setConnectionError(null);
    setConnectionNotice(null);
    try {
      const res = await fetch(action === "sync" ? "/api/email/mailbox/sync" : "/api/email/gmail/watch", {
        method: "POST",
        headers: action === "sync" ? { "Content-Type": "application/json" } : undefined,
        body: action === "sync" && primaryConnection?.id ? JSON.stringify({ connectionId: primaryConnection.id }) : undefined,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? `Could not ${action === "sync" ? "sync mailbox" : "start Gmail live watch"}.`);
      }
      setConnectionNotice(action === "sync" ? "Mailbox sync finished. New mail should now appear in the inbox." : "Live Gmail watch is active.");
      await refreshConnections();
    } catch (error) {
      setConnectionError(
        friendlyEmailConnectorMessage(error instanceof Error ? error.message : "Connection action failed.")
      );
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
        throw new Error(payload.error ?? "Could not disconnect this mailbox.");
      }
      setConnectionNotice("Mailbox connection has been disconnected. You can reconnect whenever you are ready.");
      await refreshConnections();
    } catch (error) {
      setConnectionError(
        friendlyEmailConnectorMessage(error instanceof Error ? error.message : "Could not disconnect this mailbox.")
      );
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
            <p className="eyebrow text-[9px] text-[var(--muted)]">Mailbox connection</p>
            <p className="mt-1 text-base font-semibold">Choose how your team receives email</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">
              Connect Gmail, Microsoft 365, app-password mailboxes, or IMAP/SMTP servers without starting from webhook infrastructure.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={refreshConnections}
              disabled={connectionsLoading}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--line-strong)] disabled:opacity-50"
            >
              {connectionsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-5">
          <EmailConnectionSetup
            canEdit={canEdit}
            returnTo="/settings?tab=channels"
            onSaved={refreshConnections}
            onNotice={setConnectionNotice}
            onError={(message) => setConnectionError(message || null)}
          />
        </div>

        <div className="mt-5 rounded-[18px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-4">
          {connectionsLoading && <p className="text-sm text-[var(--muted)]">Checking mailbox connection status...</p>}

          {!connectionsLoading && !primaryConnection && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">No mailbox connected yet</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Choose a connection type above. Active mailbox methods can poll inbound email and send approved replies.
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
                    {connectionAction === "sync" ? "Importing..." : "Import latest email"}
                  </button>
                  <button
                    onClick={() => runConnectionAction("watch")}
                    disabled={!canEdit || !isConnected || !isGmailOauth || connectionAction !== null}
                    className="rounded-full border border-[var(--line)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--line-strong)] disabled:opacity-45"
                  >
                    {connectionAction === "watch" ? "Repairing..." : "Repair Gmail live updates"}
                  </button>
                  <button
                    onClick={disconnectConnection}
                    disabled={!canEdit || connectionAction !== null}
                    className="rounded-full border border-[rgba(144,50,61,0.45)] px-4 py-2 text-xs font-medium text-[rgba(255,190,190,0.9)] transition-colors hover:border-[rgba(144,50,61,0.75)] disabled:opacity-45"
                  >
                    {connectionAction === "disconnect" ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ConnectorMetric label="Last inbound sync" value={formatTimestamp(primaryConnection.last_inbound_sync_at ?? primaryConnection.last_sync_at)} />
                <ConnectorMetric label="Last outbound send" value={formatTimestamp(primaryConnection.last_outbound_send_at ?? null)} />
                <ConnectorMetric label="Last validation" value={formatTimestamp(primaryConnection.last_validated_at ?? null)} />
                <ConnectorMetric label="Token expires" value={formatTimestamp(primaryConnection.token_expires_at)} />
              </div>

              {(primaryConnection.last_error_message || primaryConnection.error_message) && (
                <div className="rounded-[14px] border border-[rgba(144,50,61,0.4)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-xs leading-5 text-[rgba(255,210,210,0.9)]">
                  {primaryConnection.last_error_code ? `${primaryConnection.last_error_code}: ` : ""}{primaryConnection.last_error_message ?? primaryConnection.error_message}
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

      <details className="rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-5">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)]">
          Advanced developer setup
        </summary>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          Webhook/API inbound channels are still available for relays and custom parsers, but ordinary mailbox setup should start with the connection choices above.
        </p>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="eyebrow text-[9px] text-[var(--muted)]">Custom inbound</p>
            <p className="mt-1 text-base font-semibold">Non-Gmail webhook channel</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">
              Use this for internal dogfooding, demos, SMTP relays, or parsed inbound providers that can POST normalized email events to Work Hat.
            </p>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
            customChannel?.status === "active"
              ? "border-emerald-400/25 text-emerald-200"
              : "border-[var(--line)] text-[var(--muted)]"
          }`}>
            <span className={`h-2 w-2 rounded-full ${customChannel?.status === "active" ? "bg-emerald-400" : "bg-[var(--muted)]"}`} />
            {customChannel ? customChannel.status : "not configured"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
            Channel name
            <input
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              disabled={!canEdit}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--moss)] disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
            From / reply name
            <input
              value={customFromName}
              onChange={(event) => setCustomFromName(event.target.value)}
              disabled={!canEdit}
              placeholder="Work Hat Support"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--moss)] disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
            Reply identity
            <input
              value={customReplyIdentity}
              onChange={(event) => setCustomReplyIdentity(event.target.value)}
              disabled={!canEdit}
              placeholder="support@yourdomain.com"
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--moss)] disabled:opacity-60"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!customChannel ? (
            <button
              onClick={() => saveCustomInbound("create")}
              disabled={!canEdit || customAction !== null}
              className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-45"
            >
              {customAction === "create" ? "Creating..." : "Create custom channel"}
            </button>
          ) : (
            <>
              <button
                onClick={() => saveCustomInbound("update")}
                disabled={!canEdit || customAction !== null}
                className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-45"
              >
                {customAction === "update" ? "Saving..." : "Save channel"}
              </button>
              <button
                onClick={() => saveCustomInbound("regenerate")}
                disabled={!canEdit || customAction !== null}
                className="rounded-full border border-[rgba(144,50,61,0.45)] px-4 py-2 text-xs font-medium text-[rgba(255,190,190,0.9)] transition-colors hover:border-[rgba(144,50,61,0.75)] disabled:opacity-45"
              >
                {customAction === "regenerate" ? "Regenerating..." : "Regenerate token"}
              </button>
            </>
          )}
        </div>

        {customChannel && (
          <div className="mt-5 space-y-3">
            <div>
              <p className="text-xs font-medium text-[var(--muted)]">Webhook endpoint</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-[12px] border border-[var(--line)] bg-[var(--sage)] px-4 py-2.5 text-xs font-mono text-[var(--foreground)]">
                  {customChannel.webhookEndpoint}
                </code>
                <CopyButton value={customChannel.webhookEndpoint} />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-[var(--muted)]">Shared token</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-[12px] border border-[var(--line)] bg-[var(--sage)] px-4 py-2.5 text-xs font-mono text-[var(--foreground)]">
                  {customChannel.webhookSecret ?? customChannel.webhookSecretHint ?? "Token hidden; regenerate to copy a new token"}
                </code>
                {customChannel.webhookSecret && <CopyButton value={customChannel.webhookSecret} />}
              </div>
              <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
                Full tokens are shown only immediately after creation or regeneration.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <ConnectorMetric label="Last inbound" value={formatTimestamp(customChannel.lastInboundAt)} />
              <ConnectorMetric label="Last event" value={customChannel.lastEvent ? `${customChannel.lastEvent.status} at ${formatTimestamp(customChannel.lastEvent.received_at)}` : "Not received"} />
              <ConnectorMetric label="Last error" value={customChannel.lastErrorMessage ?? "None"} />
            </div>
          </div>
        )}
      </details>

      <SectionCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow text-[9px] text-[var(--muted)]">System readiness</p>
            <p className="mt-1 text-base font-semibold">Admin setup health</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">
              These admin-only checks confirm whether self-serve mailbox setup is ready for users before they reach onboarding.
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
              {setupHealth && (
                <div className="grid gap-3 md:grid-cols-3">
                  <ConnectorMetric label="Google OAuth configured" value={setupHealth.summary.googleOAuthConfigured ? "Yes" : "No"} />
                  <ConnectorMetric label="Google redirect confirmed" value={setupHealth.summary.googleRedirectUriConfirmed ? "Yes" : "No"} />
                  <ConnectorMetric label="Google redirect URI" value={setupHealth.summary.googleRedirectUri ?? "Set NEXT_PUBLIC_APP_URL"} />
                  <ConnectorMetric label="Encryption key configured" value={setupHealth.summary.encryptionConfigured ? "Yes" : "No"} />
                  <ConnectorMetric label="Server database key configured" value={setupHealth.summary.serverDatabaseConfigured ? "Yes" : "No"} />
                  <ConnectorMetric label="Redis configured" value={setupHealth.summary.redisConfigured ? "Yes" : "No"} />
                  <ConnectorMetric label="Inbound adapter available" value={setupHealth.summary.activeInboundAdapterAvailable ? "Yes" : "No"} />
                  <ConnectorMetric label="Outbound adapter available" value={setupHealth.summary.activeOutboundAdapterAvailable ? "Yes" : "No"} />
                  <ConnectorMetric label="Next action" value={setupHealth.summary.nextAction} />
                </div>
              )}
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
          <p className="mt-1 text-base font-semibold">Mailbox setup map</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Use the connection type that matches the mailbox your team already has. Webhook/API setup is reserved for developer relays and parsers.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["OAuth / xOAuth", "Gmail OAuth is live. Outlook / Microsoft 365 can use app password or IMAP/SMTP until Microsoft OAuth is enabled."],
              ["Mailbox login and password", "Direct mailbox authentication for providers that still allow it."],
              ["App password", "Provider-issued app passwords for Gmail with 2FA, Outlook, iCloud, and similar setups."],
              ["IMAP / SMTP", "Host, port, and TLS settings for company mailboxes, Zoho, cPanel, and private servers."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-4">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{body}</p>
              </div>
            ))}
          </div>
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

// ── Intents tab ───────────────────────────────────────────────────────────────

type IntentRecord = {
  id: string;
  name: string;
  color: string;
  keywords: string[];
  skill_required: string | null;
  priority_order: number;
  priority_level: "high" | "normal" | "low";
  created_at: string;
};

const INTENT_COLORS = [
  "#78a17a", // moss green
  "#6b8fc7", // blue
  "#c77a6b", // red
  "#c7b26b", // amber
  "#9b6bc7", // purple
  "#6bc7c3", // teal
  "#c76b9b", // pink
  "#8a9b6b", // olive
];

const PRIORITY_LEVEL_LABELS: Record<string, string> = {
  high: "High priority (SLA)",
  normal: "Normal",
  low: "Low priority",
};

function IntentFormModal({
  intent,
  onSave,
  onClose,
}: {
  intent: IntentRecord | null; // null = create new
  onSave: (saved: IntentRecord) => void;
  onClose: () => void;
}) {
  const isEdit = Boolean(intent);
  const [name, setName] = useState(intent?.name ?? "");
  const [color, setColor] = useState(intent?.color ?? INTENT_COLORS[0]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>(intent?.keywords ?? []);
  const [skillRequired, setSkillRequired] = useState(intent?.skill_required ?? "");
  const [priorityOrder, setPriorityOrder] = useState(intent?.priority_order ?? 100);
  const [priorityLevel, setPriorityLevel] = useState<"high" | "normal" | "low">(intent?.priority_level ?? "normal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addKeyword() {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw || keywords.includes(kw)) return;
    setKeywords((prev) => [...prev, kw]);
    setKeywordInput("");
  }

  function removeKeyword(kw: string) {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  }

  async function handleSave() {
    if (!name.trim()) { setError("Intent name is required."); return; }
    setSaving(true);
    setError(null);

    const body = { name: name.trim(), color, keywords, skill_required: skillRequired.trim() || null, priority_order: priorityOrder, priority_level: priorityLevel };
    const url = isEdit ? `/api/intents/${intent!.id}` : "/api/intents";
    const method = isEdit ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { intent?: IntentRecord; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (!data.intent) throw new Error("Invalid response from server");
      onSave(data.intent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-[24px] border border-[var(--line)] bg-[var(--background)] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 mb-5">
          <h2 className="text-base font-semibold">{isEdit ? "Edit intent" : "New intent"}</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)] text-lg leading-none">✕</button>
        </div>

        <div className="space-y-4">
          {/* Name + color */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="intent-name" className="eyebrow text-[9px] text-[var(--muted)]">Name *</label>
              <input
                id="intent-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Billing, Onboarding"
                className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="eyebrow text-[9px] text-[var(--muted)]">Color</label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {INTENT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${color === c ? "border-white scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Keywords */}
          <div className="space-y-1.5">
            <label htmlFor="intent-keyword" className="eyebrow text-[9px] text-[var(--muted)]">Keywords — first match wins</label>
            <div className="flex gap-2">
              <input
                id="intent-keyword"
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                placeholder="invoice, payment, charge…"
                className="flex-1 rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)]"
              />
              <button
                onClick={addKeyword}
                disabled={!keywordInput.trim()}
                className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--sage)] px-2.5 py-1 text-xs"
                  >
                    {kw}
                    <button onClick={() => removeKeyword(kw)} className="text-[var(--muted)] hover:text-[var(--foreground)]">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Skill + priority row */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="intent-skill" className="eyebrow text-[9px] text-[var(--muted)]">Required skill for routing</label>
              <input
                id="intent-skill"
                type="text"
                value={skillRequired}
                onChange={(e) => setSkillRequired(e.target.value)}
                placeholder="e.g. finance, back office"
                className="w-full rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)]"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="intent-priority-order" className="eyebrow text-[9px] text-[var(--muted)]">Priority order</label>
              <input
                id="intent-priority-order"
                type="number"
                value={priorityOrder}
                onChange={(e) => setPriorityOrder(Number(e.target.value))}
                min={1}
                className="w-20 rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)]"
              />
            </div>
          </div>

          {/* SLA level */}
          <div className="space-y-1.5">
            <label className="eyebrow text-[9px] text-[var(--muted)]">SLA priority level</label>
            <div className="flex gap-2">
              {(["high", "normal", "low"] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setPriorityLevel(lvl)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    priorityLevel === lvl
                      ? "border-[var(--moss)] bg-[rgba(120,161,122,0.1)] text-[var(--foreground)]"
                      : "border-[var(--line-strong)] text-[var(--muted)]"
                  }`}
                >
                  {PRIORITY_LEVEL_LABELS[lvl]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-[rgba(220,80,80,0.9)]">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="rounded-full bg-[var(--moss)] px-5 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create intent"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Corrections types ─────────────────────────────────────────────────────────

type CorrectionRecord = {
  id: string;
  original_intent: string;
  corrected_intent: string;
  was_changed: boolean;
  closure_note: string | null;
  suggested_keywords: string[] | null;
  status: string;
  created_at: string;
  conversation_id: string;
};

type CorrectionPattern = {
  originalIntent: string;
  correctedIntent: string;
  count: number;
};

// ── CorrectionsPanel ──────────────────────────────────────────────────────────

function CorrectionsPanel({
  intents,
  onIntentUpdated,
}: {
  intents: IntentRecord[];
  onIntentUpdated: (updated: IntentRecord) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [corrections, setCorrections] = useState<CorrectionRecord[]>([]);
  const [patterns, setPatterns] = useState<CorrectionPattern[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null); // intentName being applied
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/intent-corrections");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { corrections?: CorrectionRecord[]; patterns?: CorrectionPattern[] };
        setCorrections(data.corrections ?? []);
        setPatterns(data.patterns ?? []);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Failed to load corrections");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group AI-suggested keywords by corrected_intent
  const suggestionsByIntent = corrections.reduce<Record<string, Set<string>>>((acc, c) => {
    if (!c.suggested_keywords?.length || !c.was_changed) return acc;
    const key = c.corrected_intent.trim().toLowerCase();
    if (!acc[key]) acc[key] = new Set();
    c.suggested_keywords.forEach((kw) => acc[key].add(kw.trim().toLowerCase()));
    return acc;
  }, {});

  const intentSuggestions = Object.entries(suggestionsByIntent)
    .map(([name, kwSet]) => ({ name, keywords: [...kwSet] }))
    .filter((g) => g.keywords.length > 0);

  async function handleApply(intentName: string, newKeywords: string[]) {
    const match = intents.find((i) => i.name.toLowerCase() === intentName.toLowerCase());
    if (!match) {
      setApplyError(`Intent "${intentName}" not found — create it first.`);
      return;
    }

    setApplying(intentName);
    setApplyError(null);

    const merged = [...new Set([...match.keywords, ...newKeywords])];

    try {
      const res = await fetch(`/api/intents/${match.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: merged }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { intent?: IntentRecord };
      if (data.intent) onIntentUpdated(data.intent);
      setApplied((prev) => new Set([...prev, intentName]));
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to apply keywords.");
    } finally {
      setApplying(null);
    }
  }

  if (loading) {
    return (
      <div className="py-4 text-xs text-[var(--muted)]">Loading correction data…</div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-[14px] border border-[rgba(144,50,61,0.4)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-xs text-[rgba(255,210,210,0.9)]">
        {fetchError}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Recurring correction patterns */}
      {patterns.length > 0 && (
        <div>
          <p className="eyebrow text-[9px] text-[var(--muted)] mb-2">Recurring misclassifications</p>
          <div className="space-y-1.5">
            {patterns.map((p) => (
              <div
                key={`${p.originalIntent}→${p.correctedIntent}`}
                className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2.5 text-xs"
              >
                <span className="font-medium text-[rgba(255,180,180,0.85)]">{p.originalIntent}</span>
                <span className="text-[var(--muted)]">→</span>
                <span className="font-medium">{p.correctedIntent}</span>
                <span className="ml-auto shrink-0 rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                  {p.count}× corrected
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keyword suggestions */}
      {intentSuggestions.length > 0 ? (
        <div>
          <p className="eyebrow text-[9px] text-[var(--muted)] mb-2">AI keyword suggestions</p>
          {applyError && (
            <div className="mb-3 rounded-[12px] border border-[rgba(144,50,61,0.4)] bg-[rgba(73,17,28,0.18)] px-3 py-2 text-xs text-[rgba(255,210,210,0.9)]">
              {applyError}
            </div>
          )}
          <div className="space-y-3">
            {intentSuggestions.map(({ name, keywords }) => {
              const isApplied = applied.has(name);
              const isApplying = applying === name;
              const matchedIntent = intents.find((i) => i.name.toLowerCase() === name.toLowerCase());
              // Filter out keywords already on the intent
              const newOnly = keywords.filter(
                (kw) => !matchedIntent?.keywords.some((ex) => ex.toLowerCase() === kw.toLowerCase())
              );
              if (newOnly.length === 0 && !isApplied) return null;

              return (
                <div
                  key={name}
                  className="rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {matchedIntent && (
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: matchedIntent.color }}
                        />
                      )}
                      <p className="text-xs font-semibold capitalize">{name.replace(/_/g, " ")}</p>
                    </div>
                    {isApplied ? (
                      <span className="text-[10px] text-[var(--moss)]">✓ Applied</span>
                    ) : (
                      <button
                        onClick={() => void handleApply(name, newOnly)}
                        disabled={isApplying || newOnly.length === 0}
                        className="rounded-full bg-[var(--moss)] px-3 py-1 text-[10px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {isApplying ? "Applying…" : `Add ${newOnly.length} keyword${newOnly.length !== 1 ? "s" : ""}`}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {newOnly.map((kw) => (
                      <span
                        key={kw}
                        className="rounded-full border border-[rgba(120,161,122,0.35)] bg-[rgba(120,161,122,0.08)] px-2.5 py-0.5 text-[10px] text-[var(--foreground)]"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          {corrections.length === 0
            ? "No corrections logged yet. Suggestions appear here after agents resolve conversations."
            : "No new keyword suggestions yet — the AI needs a few more corrections on the same intent to propose improvements."}
        </p>
      )}

      {patterns.length === 0 && intentSuggestions.length === 0 && corrections.length > 0 && (
        <p className="text-xs text-[var(--muted)]">
          {corrections.length} correction{corrections.length !== 1 ? "s" : ""} logged — recurring patterns will surface here once the same intent is corrected 2+ times.
        </p>
      )}
    </div>
  );
}

// ── IntentsTab ────────────────────────────────────────────────────────────────

function IntentsTab({ canManage }: { canManage: boolean }) {
  const [intents, setIntents] = useState<IntentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"create" | IntentRecord | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCorrections, setShowCorrections] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/intents");
      const data = await res.json() as { intents?: IntentRecord[] };
      setIntents(data.intents ?? []);
    } catch {
      setError("Could not load intents.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this intent? Conversations already tagged will keep their label.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/intents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setIntents((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError("Could not delete intent.");
    } finally {
      setDeleting(null);
    }
  }

  function handleSaved(saved: IntentRecord) {
    setIntents((prev) => {
      const exists = prev.find((i) => i.id === saved.id);
      const updated = exists
        ? prev.map((i) => (i.id === saved.id ? saved : i))
        : [...prev, saved];
      return updated.sort((a, b) => a.priority_order - b.priority_order);
    });
    setModal(null);
  }

  function handleIntentUpdated(updated: IntentRecord) {
    setIntents((prev) =>
      prev.map((i) => (i.id === updated.id ? updated : i))
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Intent classification</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Intents are matched in priority order — first keyword match wins.
            Unmatched conversations land in the Unclassified inbox filter.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setModal("create")}
            className="shrink-0 rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white"
          >
            + New intent
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-[14px] border border-[rgba(144,50,61,0.4)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-xs text-[rgba(255,210,210,0.9)]">
          {error}
        </div>
      )}

      {loading ? (
        <SectionCard>
          <p className="text-sm text-[var(--muted)]">Loading intents…</p>
        </SectionCard>
      ) : intents.length === 0 ? (
        <SectionCard>
          <div className="py-6 text-center">
            <p className="text-sm font-medium">No intents configured</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Create your first intent to start auto-classifying inbound messages.
            </p>
            {canManage && (
              <button
                onClick={() => setModal("create")}
                className="mt-4 rounded-full bg-[var(--moss)] px-5 py-2 text-xs font-medium text-white"
              >
                Create first intent
              </button>
            )}
          </div>
        </SectionCard>
      ) : (
        <SectionCard className="p-0 overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[2fr_3fr_1fr_1fr_80px] gap-3 border-b border-[var(--line)] px-5 py-2.5">
            {["Intent", "Keywords", "Skill", "SLA", ""].map((h) => (
              <p key={h} className="eyebrow text-[9px] text-[var(--muted)]">{h}</p>
            ))}
          </div>
          {intents.map((intent, i) => (
            <div
              key={intent.id}
              className={`grid grid-cols-[2fr_3fr_1fr_1fr_80px] items-center gap-3 px-5 py-3.5 ${
                i < intents.length - 1 ? "border-b border-[var(--line)]" : ""
              }`}
            >
              {/* Name pill */}
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: intent.color }}
                />
                <p className="truncate text-sm font-medium">{intent.name}</p>
                <span className="shrink-0 rounded border border-[var(--line)] px-1.5 py-0.5 text-[9px] text-[var(--muted)]">
                  #{intent.priority_order}
                </span>
              </div>

              {/* Keywords */}
              <div className="flex flex-wrap gap-1 min-w-0">
                {intent.keywords.slice(0, 4).map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full border border-[var(--line)] bg-[var(--sage)] px-2 py-0.5 text-[10px]"
                  >
                    {kw}
                  </span>
                ))}
                {intent.keywords.length > 4 && (
                  <span className="text-[10px] text-[var(--muted)]">+{intent.keywords.length - 4}</span>
                )}
                {intent.keywords.length === 0 && (
                  <span className="text-[10px] text-[var(--muted)] italic">No keywords</span>
                )}
              </div>

              {/* Skill */}
              <p className="truncate text-xs text-[var(--muted)] capitalize">
                {intent.skill_required || "—"}
              </p>

              {/* SLA */}
              <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${
                intent.priority_level === "high"
                  ? "bg-[rgba(144,50,61,0.12)] text-[rgba(255,180,180,0.9)]"
                  : intent.priority_level === "low"
                  ? "bg-[var(--sage)] text-[var(--muted)]"
                  : "bg-[var(--sage)] text-[var(--foreground)]"
              }`}>
                {intent.priority_level}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-2 justify-end">
                {canManage && (
                  <>
                    <button
                      onClick={() => setModal(intent)}
                      className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(intent.id)}
                      disabled={deleting === intent.id}
                      className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40"
                    >
                      {deleting === intent.id ? "…" : "Delete"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      {/* Self-learning panel */}
      <SectionCard>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow text-[9px] text-[var(--muted)]">Self-learning</p>
            <p className="mt-1 text-sm font-semibold">Keyword suggestions from agent corrections</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              When agents correct an intent at resolution, the AI analyzes the email and proposes new keywords.
              All suggestions require your approval before taking effect.
            </p>
          </div>
          <button
            onClick={() => setShowCorrections((v) => !v)}
            className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
              showCorrections
                ? "border-[var(--moss)] text-[var(--moss)]"
                : "border-[var(--line-strong)] text-[var(--muted)] hover:border-[var(--moss)] hover:text-[var(--foreground)]"
            }`}
          >
            {showCorrections ? "Hide" : "View patterns & suggestions"}
          </button>
        </div>

        {showCorrections && (
          <CorrectionsPanel intents={intents} onIntentUpdated={handleIntentUpdated} />
        )}
      </SectionCard>

      {/* Modal */}
      {modal && (
        <IntentFormModal
          intent={modal === "create" ? null : modal}
          onSave={handleSaved}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── SLA tab ───────────────────────────────────────────────────────────────────

function SlaTab({
  policy,
  canEdit,
  onDirty,
  onSaveFields,
}: {
  policy: SlaPolicyRecord | null;
  canEdit: boolean;
  onDirty: () => void;
  onSaveFields: (fields: Record<string, string | number | boolean>) => void;
}) {
  const defaults = policy ?? {
    enabled: true,
    first_response_minutes: 60,
    next_response_minutes: 240,
    at_risk_threshold_minutes: 15,
    business_hours_json: { mode: "calendar" },
  };
  const [values, setValues] = useState(defaults);

  function update(field: string, value: string | number | boolean) {
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    onDirty();
    onSaveFields({
      enabled: nextValues.enabled,
      first_response_minutes: nextValues.first_response_minutes,
      next_response_minutes: nextValues.next_response_minutes,
      at_risk_threshold_minutes: nextValues.at_risk_threshold_minutes,
      [field]: value,
    });
  }

  return (
    <div className="space-y-5">
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">SLA policy</p>
        <h2 className="mt-2 text-base font-semibold">Response targets</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          Work Hat currently measures calendar minutes from customer messages. Business-hours schedules are stored for a later phase.
        </p>

        <div className="mt-5 space-y-4">
          <FieldRow label="Enable SLA tracking" description="Disabled policies mark active conversations as not applicable on the next refresh.">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.enabled}
                disabled={!canEdit}
                onChange={(e) => update("enabled", e.currentTarget.checked)}
                className="h-4 w-4 rounded border-[var(--line)]"
              />
              Enabled
            </label>
          </FieldRow>

          <FieldRow label="First response" description="Minutes from the first customer message until the first agent reply.">
            <input
              type="number"
              min={1}
              max={10080}
              value={values.first_response_minutes}
              disabled={!canEdit}
              onChange={(e) => update("first_response_minutes", Number(e.currentTarget.value))}
              className="w-36 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)] disabled:opacity-60"
            />
          </FieldRow>

          <FieldRow label="Next response" description="Minutes from the latest customer message until the next agent reply.">
            <input
              type="number"
              min={1}
              max={10080}
              value={values.next_response_minutes}
              disabled={!canEdit}
              onChange={(e) => update("next_response_minutes", Number(e.currentTarget.value))}
              className="w-36 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)] disabled:opacity-60"
            />
          </FieldRow>

          <FieldRow label="At-risk window" description="Minutes before a deadline when the queue marks a conversation at risk.">
            <input
              type="number"
              min={1}
              max={1440}
              value={values.at_risk_threshold_minutes}
              disabled={!canEdit}
              onChange={(e) => update("at_risk_threshold_minutes", Number(e.currentTarget.value))}
              className="w-36 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--moss)] disabled:opacity-60"
            />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Computation</p>
        <div className="mt-3 grid gap-3 text-xs text-[var(--muted)]">
          <p>First response SLA is cleared by the first outbound agent message after the first customer message.</p>
          <p>Next response SLA is active when the latest customer message has no later agent response.</p>
          <p>Resolved and archived conversations are excluded from active SLA pressure.</p>
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

const VALID_TABS = new Set<SettingsTab>(["setup", "organization", "team", "channels", "sla", "ai", "intents", "billing"]);

export function SettingsShell({
  org,
  channel,
  slaPolicy,
  team,
  callerRole,
  callerId,
  initialTab,
  isDemo = false,
  baseDir = "",
  mailboxReady = false,
}: {
  org: OrgRecord | null;
  channel: ChannelRecord | null;
  slaPolicy: SlaPolicyRecord | null;
  team: TeamMember[];
  callerRole: string;
  callerId: string;
  initialTab?: string;
  isDemo?: boolean;
  baseDir?: string;
  mailboxReady?: boolean;
}) {
  const resolvedInitialTab: SettingsTab =
    initialTab && VALID_TABS.has(initialTab as SettingsTab)
      ? (initialTab as SettingsTab)
      : org && channel?.inboundAddress
        ? "organization"
        : "setup";

  const [activeTab, setActiveTab] = useState<SettingsTab>(resolvedInitialTab);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [saveFields, setSaveFields] = useState<Record<string, string | number | boolean>>({});

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
      const res = await fetch(activeTab === "sla" ? "/api/settings/sla" : "/api/settings/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveFields),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveStatus("saved");
      setIsDirty(false);
      setSaveFields({});
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
        mailboxReady={mailboxReady}
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
    sla: (
      <SlaTab
        policy={slaPolicy}
        canEdit={isAdmin}
        onDirty={() => setIsDirty(true)}
        onSaveFields={(f) => setSaveFields((prev) => ({ ...prev, ...f }))}
      />
    ),
    ai: <AiTab onDirty={() => setIsDirty(true)} />,
    intents: <IntentsTab canManage={canManageTeam} />,
    billing: <BillingTab org={org} />,
  };

  return (
    <div className="flex h-full overflow-hidden">
      <aside aria-label="Settings navigation" className="flex h-full w-[220px] shrink-0 flex-col border-r border-[var(--line)] p-3">
        <div className="px-3 py-3">
          <h1 className="text-sm font-semibold">Settings</h1>
          {org && <p className="mt-0.5 text-xs text-[var(--muted)] truncate">{org.name}</p>}
        </div>
        {/* role="tablist" + role="tab" pattern per ARIA Authoring Practices Guide */}
        <nav role="tablist" aria-label="Settings sections" className="flex flex-col gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`settings-panel-${tab.id}`}
              id={`settings-tab-${tab.id}`}
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
          <div
            id={`settings-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`settings-tab-${activeTab}`}
            className="mx-auto max-w-2xl"
          >
            {tabContent[activeTab]}
          </div>
        </div>

        {/* Save bar — only shown for tabs with editable fields */}
        {activeTab !== "team" && activeTab !== "billing" && activeTab !== "intents" && (
          <div className={`shrink-0 border-t border-[var(--line)] px-6 py-4 transition-opacity ${isDirty || saveStatus === "saved" ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
              <p aria-live="polite" className="text-xs text-[var(--muted)]">
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
