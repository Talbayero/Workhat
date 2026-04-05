"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = {
  id: string;
  title: string;
  description: string;
  content: React.ReactNode;
};

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

function StepOrg() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tz, setTz] = useState("America/New_York");
  return (
    <div className="space-y-4 mt-5">
      <InputField label="Organization name" placeholder="Acme Support" value={name} onChange={setName} />
      <InputField label="Support email" placeholder="support@acme.com" type="email" value={email} onChange={setEmail} />
      <InputField label="Timezone" placeholder="America/New_York" value={tz} onChange={setTz} />
    </div>
  );
}

function StepInbox() {
  const [address, setAddress] = useState("");
  return (
    <div className="space-y-4 mt-5">
      <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
        <p className="eyebrow text-[9px] text-[var(--muted)]">Email channel</p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Forward your support mailbox to the address below. New emails route
          directly into the inbox as conversations.
        </p>
        <div className="mt-3 rounded-[12px] border border-[var(--line)] bg-[var(--sage)] px-4 py-3 font-mono text-sm">
          inbound@work-hat.com
        </div>
      </div>
      <InputField
        label="Your current support email (to forward from)"
        placeholder="support@yourdomain.com"
        type="email"
        value={address}
        onChange={setAddress}
      />
      <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3">
        <p className="text-xs text-[var(--muted)]">
          WhatsApp, SMS, and live chat channels are coming in the next release.
        </p>
      </div>
    </div>
  );
}

function StepKnowledge() {
  const [dragging, setDragging] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const names = Array.from(e.dataTransfer.files).map((f) => f.name);
    setUploaded((prev) => [...prev, ...names]);
  }

  return (
    <div className="space-y-4 mt-5">
      <p className="text-sm leading-6 text-[var(--muted)]">
        Upload your SOPs, return policies, tone guides, and product docs. The AI
        reads these to generate accurate drafts. You can always add more in
        Settings → Knowledge later.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-[20px] border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-[var(--moss)] bg-[rgba(144,50,61,0.06)]"
            : "border-[var(--line)] bg-[var(--panel-strong)]"
        }`}
      >
        <p className="text-sm text-[var(--muted)]">
          Drop .txt, .md, or .pdf files here
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">or</p>
        <button className="mt-3 rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-medium">
          Browse files
        </button>
      </div>

      {uploaded.length > 0 && (
        <div className="space-y-2">
          {uploaded.map((name) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3"
            >
              <span className="text-sm">{name}</span>
              <span className="status-dot status-dot-green" />
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setUploaded((p) => [...p, "return-policy.md", "tone-guide.md"])}
        className="text-xs text-[var(--moss)]"
      >
        Load example files instead →
      </button>
    </div>
  );
}

function StepInvite() {
  const [emails, setEmails] = useState("");
  return (
    <div className="space-y-4 mt-5">
      <p className="text-sm leading-6 text-[var(--muted)]">
        Invite your agents and managers. Each person gets an email with a magic
        link to set up their account.
      </p>
      <div>
        <label className="eyebrow text-[10px] text-[var(--muted)]">
          Email addresses (comma-separated)
        </label>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="agent@yourteam.com, manager@yourteam.com"
          rows={3}
          className="mt-1.5 w-full rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors resize-none"
        />
      </div>
      <div className="rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4 space-y-2 text-sm">
        <p className="eyebrow text-[9px] text-[var(--muted)]">Roles</p>
        <p className="text-[var(--muted)]"><span className="text-[var(--foreground)]">Agent</span> — handles conversations, uses AI drafts</p>
        <p className="text-[var(--muted)]"><span className="text-[var(--foreground)]">Manager</span> — plus dashboard, edit analyzer, QA queue</p>
        <p className="text-[var(--muted)]"><span className="text-[var(--foreground)]">QA reviewer</span> — read-only access + review comments</p>
      </div>
    </div>
  );
}

const steps: Step[] = [
  {
    id: "org",
    title: "Create your organization",
    description: "Name your workspace and set your support email.",
    content: <StepOrg />,
  },
  {
    id: "inbox",
    title: "Connect your inbox",
    description: "Forward your support mailbox to start routing emails.",
    content: <StepInbox />,
  },
  {
    id: "knowledge",
    title: "Upload your SOPs",
    description: "Policies and tone guides the AI reads before drafting.",
    content: <StepKnowledge />,
  },
  {
    id: "invite",
    title: "Invite your team",
    description: "Add agents, managers, and QA reviewers.",
    content: <StepInvite />,
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  function advance() {
    setCompleted((prev) => new Set([...prev, currentStep]));
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      router.push("/inbox");
    }
  }

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

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
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => i <= Math.max(...completed, currentStep) && setCurrentStep(i)}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i === currentStep
                  ? "bg-[var(--moss)]"
                  : completed.has(i)
                  ? "bg-[var(--moss)] opacity-40"
                  : "bg-[var(--sage)]"
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Step card */}
        <section className="grain-panel rounded-[28px] border border-[var(--line)] p-7">
          <p className="eyebrow text-[10px] text-[var(--muted)]">
            Step {currentStep + 1} of {steps.length}
          </p>
          <h2 className="mt-2 text-xl font-semibold">{step.title}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{step.description}</p>

          {step.content}

          <div className="mt-7 flex items-center justify-between gap-4">
            <button
              onClick={() => currentStep > 0 && setCurrentStep(currentStep - 1)}
              disabled={currentStep === 0}
              className="text-sm text-[var(--muted)] disabled:opacity-0 transition-opacity"
            >
              ← Back
            </button>
            <div className="flex gap-2">
              <button
                onClick={advance}
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Skip
              </button>
              <button
                onClick={advance}
                className="rounded-full bg-[var(--moss)] px-5 py-2.5 text-sm font-medium text-white"
              >
                {isLast ? "Go to inbox →" : "Continue →"}
              </button>
            </div>
          </div>
        </section>

        {/* Already have an account */}
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
