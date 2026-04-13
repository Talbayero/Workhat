"use client";

import { useState } from "react";

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

type TeamMember = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
};

type SettingsTab = "organization" | "team" | "channels" | "ai" | "billing";

const tabs: { id: SettingsTab; label: string }[] = [
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

  function field<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      onDirty();
      onSaveFields({ name, supportEmail, fromName, timezone });
    };
  }

  return (
    <div className="space-y-5">
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Workspace</p>
        <div className="mt-1 divide-y divide-[var(--line)]">
          <FieldRow label="Organization name" description="Shown on invoices and team notifications.">
            <TextInput value={name} onChange={field(setName)} disabled={!canEdit} />
          </FieldRow>
          <FieldRow label="Support email" description="Replies go out from this address.">
            <TextInput value={supportEmail} onChange={field(setSupportEmail)} disabled={!canEdit} />
          </FieldRow>
          <FieldRow label="From name" description="Shown in the customer's inbox.">
            <TextInput value={fromName} onChange={field(setFromName)} disabled={!canEdit} />
          </FieldRow>
          <FieldRow label="Timezone" description="Used for SLA calculations.">
            <TextInput value={timezone} onChange={field(setTimezone)} disabled={!canEdit} />
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

function ChannelsTab({ channel, canEdit, onDirty }: { channel: ChannelRecord | null; canEdit: boolean; onDirty: () => void }) {
  const [fromName, setFromName] = useState(channel?.fromName ?? "");
  const [autoAssign, setAutoAssign] = useState(true);

  return (
    <div className="space-y-5">
      <SectionCard>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-[9px] text-[var(--muted)]">Email</p>
            <p className="mt-1 text-base font-semibold">Email channel</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Inbound emails route into the inbox. Agents reply directly from the thread.
            </p>
          </div>
          <span className="status-dot status-dot-green mt-1.5 shrink-0" />
        </div>
        <div className="mt-4 divide-y divide-[var(--line)]">
          <FieldRow label="Inbound address" description="Forward your support mailbox here.">
            <div className="flex items-center gap-2">
              <code className="rounded-[10px] border border-[var(--line)] bg-[var(--sage)] px-3 py-2 text-xs font-mono">
                {channel?.inboundAddress || "set up via onboarding"}
              </code>
            </div>
          </FieldRow>
          <FieldRow label="From name" description="Shown in the customer's inbox.">
            <TextInput value={fromName} onChange={(v) => { setFromName(v); onDirty(); }} disabled={!canEdit} />
          </FieldRow>
          <FieldRow label="Auto-assign new threads" description="Round-robin to active agents.">
            <Toggle checked={autoAssign} onChange={(v) => { setAutoAssign(v); onDirty(); }} />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Coming soon</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {["WhatsApp", "SMS / Twilio", "Live chat widget", "Slack connect"].map((ch) => (
            <div key={ch} className="rounded-[16px] border border-[var(--line)] px-4 py-3.5 opacity-50">
              <p className="text-sm font-medium">{ch}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Not yet available</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
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
}: {
  org: OrgRecord | null;
  channel: ChannelRecord | null;
  team: TeamMember[];
  callerRole: string;
  callerId: string;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("organization");
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [pendingFields, setPendingFields] = useState<Record<string, string>>({});

  const isAdmin = callerRole === "admin";
  const canManageTeam = isAdmin || callerRole === "manager";

  function handleDirty() {
    setIsDirty(true);
    setSaveStatus("idle");
  }

  async function handleSave() {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/settings/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingFields),
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
    organization: (
      <OrgTab
        org={org}
        channel={channel}
        canEdit={isAdmin}
        onDirty={handleDirty}
        onSaveFields={setPendingFields}
      />
    ),
    team: (
      <TeamTab
        initialMembers={team}
        callerId={callerId}
        canManage={canManageTeam}
      />
    ),
    channels: <ChannelsTab channel={channel} canEdit={isAdmin} onDirty={handleDirty} />,
    ai: <AiTab onDirty={handleDirty} />,
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
