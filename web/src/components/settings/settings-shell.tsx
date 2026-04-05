"use client";

import { useState } from "react";

type SettingsTab = "organization" | "team" | "channels" | "ai" | "billing";

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "organization", label: "Organization" },
  { id: "team", label: "Team members" },
  { id: "channels", label: "Channels" },
  { id: "ai", label: "AI settings" },
  { id: "billing", label: "Billing" },
];

const mockTeam = [
  { id: "u1", name: "Marcos", email: "marcos@work-hat.com", role: "agent", status: "active" },
  { id: "u2", name: "Anika", email: "anika@work-hat.com", role: "agent", status: "active" },
  { id: "u3", name: "Jordan", email: "jordan@work-hat.com", role: "manager", status: "active" },
  { id: "u4", name: "Casey", email: "casey@work-hat.com", role: "qa_reviewer", status: "invited" },
];

const roleLabel: Record<string, string> = {
  agent: "Agent",
  manager: "Manager",
  qa_reviewer: "QA reviewer",
  admin: "Admin",
};

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-5 ${className}`}>
      {children}
    </div>
  );
}

function FieldRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-[var(--line)] last:border-0">
      <div className="min-w-0 max-w-xs">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-64 rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
    />
  );
}

function Toggle({ defaultChecked = false }: { defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button
      onClick={() => setOn(!on)}
      className={`relative h-6 w-10 rounded-full transition-colors ${
        on ? "bg-[var(--moss)]" : "bg-[var(--sage)]"
      }`}
      aria-checked={on}
      role="switch"
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
          on ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ── Tab content ────────────────────────────────────────────────────────────────

function OrgTab({ onDirty }: { onDirty: () => void }) {
  const [orgName, setOrgName] = useState("Work Hat");
  const [supportEmail, setSupportEmail] = useState("support@work-hat.com");
  const [timezone, setTimezone] = useState("America/New_York");
  const [language, setLanguage] = useState("English (US)");

  function field(setter: (v: string) => void) {
    return (v: string) => { setter(v); onDirty(); };
  }

  return (
    <div className="space-y-5">
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Workspace</p>
        <div className="mt-1 divide-y divide-[var(--line)]">
          <FieldRow label="Organization name" description="Shown on invoices and team notifications.">
            <TextInput value={orgName} onChange={field(setOrgName)} />
          </FieldRow>
          <FieldRow label="Support email" description="Replies go out from this address.">
            <TextInput value={supportEmail} onChange={field(setSupportEmail)} />
          </FieldRow>
          <FieldRow label="Timezone" description="Used for SLA calculations and queue scheduling.">
            <TextInput value={timezone} onChange={field(setTimezone)} />
          </FieldRow>
          <FieldRow label="Default language" description="Language used for AI draft generation.">
            <TextInput value={language} onChange={field(setLanguage)} />
          </FieldRow>
        </div>
      </SectionCard>

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
    </div>
  );
}

function TeamTab({ onDirty: _onDirty }: { onDirty: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Team members</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{mockTeam.length} members</p>
        </div>
        <button className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white">
          Invite member
        </button>
      </div>

      <SectionCard className="p-0 overflow-hidden">
        {mockTeam.map((member, i) => (
          <div
            key={member.id}
            className={`flex items-center justify-between gap-4 px-5 py-4 ${
              i < mockTeam.length - 1 ? "border-b border-[var(--line)]" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sage)] text-xs font-semibold">
                {member.name[0]}
              </div>
              <div>
                <p className="text-sm font-medium">{member.name}</p>
                <p className="text-xs text-[var(--muted)]">{member.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]">
                {roleLabel[member.role]}
              </span>
              {member.status === "invited" ? (
                <span className="rounded-full bg-[rgba(169,146,125,0.15)] border border-[rgba(169,146,125,0.3)] px-2.5 py-1 text-[10px] text-[var(--muted)]">
                  Invited
                </span>
              ) : (
                <span className="status-dot status-dot-green" />
              )}
              <button className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                Edit
              </button>
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Roles</p>
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]">Agent</span>
            <p className="text-[var(--muted)]">Handles conversations, uses AI drafts, posts internal notes. Cannot access analytics or QA review.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]">Manager</span>
            <p className="text-[var(--muted)]">All agent permissions plus Dashboard, edit analyzer, QA queue, and knowledge base editing.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px]">QA reviewer</span>
            <p className="text-[var(--muted)]">Read-only access to threads and edit analysis. Can add review comments and flag patterns.</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function ChannelsTab({ onDirty }: { onDirty: () => void }) {
  const [inbound, setInbound] = useState("support@work-hat.com");
  const [fromName, setFromName] = useState("Work Hat Support");

  function field(setter: (v: string) => void) {
    return (v: string) => { setter(v); onDirty(); };
  }

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
            <TextInput value={inbound} onChange={field(setInbound)} />
          </FieldRow>
          <FieldRow label="From name" description="Shown in the customer's inbox.">
            <TextInput value={fromName} onChange={field(setFromName)} />
          </FieldRow>
          <FieldRow label="Auto-assign new threads" description="Round-robin to active agents.">
            <Toggle defaultChecked />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Coming soon</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {["WhatsApp", "SMS / Twilio", "Live chat widget", "Slack connect"].map((ch) => (
            <div
              key={ch}
              className="rounded-[16px] border border-[var(--line)] px-4 py-3.5 opacity-50"
            >
              <p className="text-sm font-medium">{ch}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Not yet available</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function AiTab({ onDirty }: { onDirty: () => void }) {
  const [model, setModel] = useState("gpt-4o");
  const [maxTokens, setMaxTokens] = useState("400");

  function field(setter: (v: string) => void) {
    return (v: string) => { setter(v); onDirty(); };
  }

  return (
    <div className="space-y-5">
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Draft generation</p>
        <div className="mt-1 divide-y divide-[var(--line)]">
          <FieldRow label="Generate drafts automatically" description="AI prepares a draft for every new inbound message.">
            <Toggle defaultChecked />
          </FieldRow>
          <FieldRow label="Show drafts to agents" description="Agents see the draft before deciding to use it.">
            <Toggle defaultChecked />
          </FieldRow>
          <FieldRow label="Require confirmation before send" description="No AI reply goes out without explicit agent approval.">
            <Toggle defaultChecked />
          </FieldRow>
          <FieldRow label="Show edit analyzer to agents" description="Agents see edit type and intensity after sending. Always visible to managers.">
            <Toggle />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Model</p>
        <div className="mt-1 divide-y divide-[var(--line)]">
          <FieldRow label="Draft model" description="Used for reply generation and edit classification.">
            <TextInput value={model} onChange={field(setModel)} />
          </FieldRow>
          <FieldRow label="Retrieval" description="Knowledge base entries injected into every draft prompt.">
            <Toggle defaultChecked />
          </FieldRow>
          <FieldRow label="Max draft tokens" description="Keeps replies concise.">
            <TextInput value={maxTokens} onChange={field(setMaxTokens)} />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">AI actions</p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Each AI draft generation, edit classification, and knowledge retrieval
          costs one AI Action. Actions reset monthly with your plan.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Used this month", value: "312" },
            { label: "Included in plan", value: "2,000" },
            { label: "Resets in", value: "26 days" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-4 py-3.5"
            >
              <p className="text-xs text-[var(--muted)]">{stat.label}</p>
              <p className="mt-1.5 text-xl font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function BillingTab() {
  return (
    <div className="space-y-5">
      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Current plan</p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-semibold">Growth</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              2,000 AI Actions / month · 5 seats · $149/mo
            </p>
          </div>
          <button className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium transition-colors hover:border-[var(--moss)]">
            Upgrade plan
          </button>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-2">
            <span>AI Actions used</span>
            <span>312 / 2,000</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--sage)]">
            <div
              className="h-full rounded-full bg-[var(--moss)]"
              style={{ width: "15.6%" }}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Payment method</p>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-[10px] border border-[var(--line)] bg-[var(--sage)] px-3 py-2 text-xs font-mono">
              Visa •••• 4242
            </div>
            <p className="text-xs text-[var(--muted)]">Expires 12/27</p>
          </div>
          <button className="text-xs text-[var(--moss)]">Update</button>
        </div>
      </SectionCard>

      <SectionCard>
        <p className="eyebrow text-[9px] text-[var(--muted)]">Invoices</p>
        <div className="mt-3 space-y-2 text-sm">
          {[
            { date: "Apr 1, 2026", amount: "$149.00", status: "Paid" },
            { date: "Mar 1, 2026", amount: "$149.00", status: "Paid" },
            { date: "Feb 1, 2026", amount: "$149.00", status: "Paid" },
          ].map((inv) => (
            <div key={inv.date} className="flex items-center justify-between gap-4 py-2 border-b border-[var(--line)] last:border-0">
              <span className="text-[var(--muted)]">{inv.date}</span>
              <span>{inv.amount}</span>
              <span className="text-xs text-[var(--muted)]">{inv.status}</span>
              <button className="text-xs text-[var(--moss)]">Download</button>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────────

export function SettingsShell() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("organization");
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  function handleDirty() {
    setIsDirty(true);
    setSaveStatus("idle");
  }

  async function handleSave() {
    setSaveStatus("saving");
    // Phase 2: PATCH /api/settings with form state
    await new Promise((r) => setTimeout(r, 600));
    setSaveStatus("saved");
    setIsDirty(false);
    setTimeout(() => setSaveStatus("idle"), 2500);
  }

  function handleCancel() {
    setIsDirty(false);
    setSaveStatus("idle");
  }

  const tabContent: Record<SettingsTab, React.ReactNode> = {
    organization: <OrgTab onDirty={handleDirty} />,
    team: <TeamTab onDirty={handleDirty} />,
    channels: <ChannelsTab onDirty={handleDirty} />,
    ai: <AiTab onDirty={handleDirty} />,
    billing: <BillingTab />,
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Settings sidebar */}
      <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-[var(--line)] p-3">
        <div className="px-3 py-3">
          <h1 className="text-sm font-semibold">Settings</h1>
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

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="scroll-soft flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-2xl">
            {tabContent[activeTab]}
          </div>
        </div>

        {/* Save bar */}
        <div
          className={`shrink-0 border-t border-[var(--line)] px-6 py-4 transition-opacity ${
            isDirty || saveStatus === "saved" ? "opacity-100" : "opacity-40 pointer-events-none"
          }`}
        >
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
            <p className="text-xs text-[var(--muted)]">
              {saveStatus === "saved"
                ? "All changes saved."
                : isDirty
                ? "You have unsaved changes."
                : "No unsaved changes."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
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
      </div>
    </div>
  );
}
