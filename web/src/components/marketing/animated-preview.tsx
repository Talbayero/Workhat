"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SCENES = [
  {
    id: "triage",
    step: "01",
    label: "Triage",
    title: "Inbox becomes an operating picture",
    caption:
      "Every conversation arrives with owner, risk, contact context, and the exact AI confidence posture your team should trust.",
    metric: "4 high-risk",
    metricLabel: "threads surfaced",
  },
  {
    id: "draft",
    step: "02",
    label: "Draft",
    title: "AI shows its work before anyone sends",
    caption:
      "The draft is paired with reasoning, missing context, confidence, and the rules it used, so agents supervise instead of guessing.",
    metric: "68%",
    metricLabel: "draft acceptance",
  },
  {
    id: "learn",
    step: "03",
    label: "Improve",
    title: "Every edit turns into QA intelligence",
    caption:
      "When agents revise a reply, Work Hat records the delta and rolls the lesson into QA, coaching, and prompt improvement signals.",
    metric: "24%",
    metricLabel: "avg edit intensity",
  },
] as const;

type SceneId = (typeof SCENES)[number]["id"];

const queueItems = [
  { name: "Nina Patel", company: "Northstar Home", subject: "Order still shows label created", risk: "yellow", active: true },
  { name: "David Rojas", company: "Peak Trail Co.", subject: "Can we waive the return fee?", risk: "green", active: false },
  { name: "Sofia Nguyen", company: "Fieldmade Studio", subject: "Invoice has the wrong billing contact", risk: "yellow", active: false },
];

const telemetry = [
  { label: "Missing context", value: 42, color: "bg-[var(--moss)]" },
  { label: "Tone rewrite", value: 28, color: "bg-[#c76a73]" },
  { label: "Policy correction", value: 18, color: "bg-[#7a1d2a]" },
  { label: "Accepted", value: 12, color: "bg-emerald-500" },
];

function classForScene(scene: SceneId, activeScene: SceneId) {
  return scene === activeScene
    ? "border-[rgba(144,50,61,0.55)] bg-[rgba(144,50,61,0.12)] text-[var(--foreground)] shadow-[0_0_35px_rgba(144,50,61,0.15)]"
    : "border-[var(--line)] bg-[rgba(242,244,243,0.02)] text-[var(--muted)]";
}

function StatusDot({ risk }: { risk: string }) {
  return <span className={`h-1.5 w-1.5 rounded-full ${risk === "green" ? "bg-emerald-400" : "bg-[var(--amber)]"}`} />;
}

function SceneButton({
  index,
  active,
  onSelect,
}: {
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  const scene = SCENES[index];

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`group rounded-2xl border p-3 text-left transition-all hover:border-[rgba(144,50,61,0.45)] hover:text-[var(--foreground)] ${
        active
          ? "border-[rgba(144,50,61,0.55)] bg-[rgba(144,50,61,0.12)]"
          : "border-[var(--line)] bg-black/20"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`font-mono text-[10px] ${active ? "text-[var(--moss)]" : "text-[var(--muted)]"}`}>
          {scene.step}
        </span>
        <span className={`h-1.5 rounded-full transition-all ${active ? "w-7 bg-[var(--moss)]" : "w-2 bg-[var(--line-strong)]"}`} />
      </div>
      <p className="mt-3 text-sm font-semibold">{scene.label}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{scene.title}</p>
    </button>
  );
}

function QueuePanel({ activeScene }: { activeScene: SceneId }) {
  return (
    <aside className="hidden min-h-0 border-r border-[var(--line)] bg-black/25 p-4 lg:block">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Queue</p>
          <p className="mt-1 text-sm font-semibold">Active support</p>
        </div>
        <span className="rounded-full border border-[rgba(144,50,61,0.35)] bg-[rgba(144,50,61,0.12)] px-2.5 py-1 font-mono text-[10px] text-[var(--moss)]">
          12 open
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {queueItems.map((item) => (
          <div
            key={item.subject}
            className={`rounded-2xl border p-3 transition-all ${
              item.active
                ? classForScene("triage", activeScene)
                : "border-[var(--line)] bg-[rgba(242,244,243,0.025)]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--foreground)]">{item.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{item.company}</p>
              </div>
              <StatusDot risk={item.risk} />
            </div>
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{item.subject}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ConversationPanel({ activeScene }: { activeScene: SceneId }) {
  return (
    <section className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-col gap-4 border-b border-[var(--line)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Northstar Home</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--foreground)]">Urgent: order still shows label created</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {['shipping', 'vip', 'needs carrier context'].map((tag) => (
              <span key={tag} className="rounded-full border border-[var(--line)] bg-black/25 px-2.5 py-1 text-[11px] text-[var(--muted)]">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${classForScene("triage", activeScene)}`}>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">AI confidence</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold"><StatusDot risk="yellow" /> Yellow</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-3xl border border-[var(--line)] bg-[rgba(242,244,243,0.025)] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Nina Patel</p>
            <span className="font-mono text-[10px] text-[var(--muted)]">09:08</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Hi team, my order still shows &quot;label created&quot; and the last agent said it should move today. I need a real update because this is for a client install.
          </p>
        </div>

        <div className={`rounded-3xl border p-4 transition-all ${classForScene("draft", activeScene)}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">AI draft</p>
              <p className="mt-1 text-sm font-semibold">Human-approved reply, not auto-send</p>
            </div>
            <span className="w-fit rounded-full bg-[var(--moss)] px-3 py-1 text-[11px] font-semibold text-white">Draft only</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            Thanks for your patience, Nina. I can see the order is still awaiting carrier movement, and I do not want to promise a delivery time until we confirm the latest checkpoint.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {['Acknowledges delay', 'Avoids false ETA', 'Requests carrier check'].map((item) => (
              <div key={item} className="rounded-2xl border border-[var(--line)] bg-black/25 px-3 py-2 text-[11px] text-[var(--muted)]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function IntelligencePanel({ activeScene }: { activeScene: SceneId }) {
  return (
    <aside className="border-t border-[var(--line)] bg-black/20 p-4 lg:border-l lg:border-t-0">
      <div className={`rounded-3xl border p-4 transition-all ${classForScene("draft", activeScene)}`}>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">AI guidance</p>
        <h4 className="mt-3 text-base font-semibold leading-6 text-[var(--foreground)]">Why this draft looks the way it does</h4>
        <div className="mt-4 space-y-3 text-xs leading-5 text-[var(--muted)]">
          <p>The customer needs a status update, but carrier confirmation is missing.</p>
          <p>Avoid absolute delivery promises until fulfillment confirms movement.</p>
        </div>
      </div>

      <div className={`mt-3 rounded-3xl border p-4 transition-all ${classForScene("learn", activeScene)}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">QA signal</p>
          <span className="rounded-full border border-[rgba(144,50,61,0.35)] px-2 py-1 font-mono text-[10px] text-[var(--moss)]">Live</span>
        </div>
        <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">Edit pattern breakdown</p>
        <div className="mt-4 space-y-3">
          {telemetry.map((bar) => (
            <div key={bar.label}>
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--muted)]">
                <span>{bar.label}</span>
                <span>{bar.value}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function ProductStage({ activeScene }: { activeScene: SceneId }) {
  return (
    <div className="relative overflow-hidden rounded-[30px] border border-[var(--line)] bg-[#070707] shadow-[0_44px_140px_rgba(0,0,0,0.78)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(circle at 50% -15%, rgba(144,50,61,0.34), transparent 42%), radial-gradient(circle at 12% 20%, rgba(242,244,243,0.06), transparent 28%)",
        }}
      />
      <div className="relative border-b border-[var(--line)] bg-[rgba(242,244,243,0.025)] px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#5e0b15]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#90323d]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#a9927d]" />
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">workhat.demo / support-loop</div>
          <div className="hidden items-center gap-2 text-[11px] text-[var(--muted)] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Demo data running
          </div>
        </div>
      </div>

      <div className="relative grid min-h-[560px] lg:grid-cols-[210px_minmax(0,1fr)_300px]">
        <QueuePanel activeScene={activeScene} />
        <ConversationPanel activeScene={activeScene} />
        <IntelligencePanel activeScene={activeScene} />
      </div>
    </div>
  );
}

export function AnimatedPreview() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % SCENES.length);
    }, 5200);

    return () => window.clearInterval(timer);
  }, []);

  const activeScene = SCENES[active];

  return (
    <div className="relative mx-auto max-w-6xl">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-10 h-[420px] w-[78%] -translate-x-1/2 rounded-full opacity-45 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(144,50,61,0.28), transparent 68%)" }}
      />

      <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ProductStage activeScene={activeScene.id} />

        <div className="flex flex-col gap-4">
          <div className="rounded-[28px] border border-[var(--line)] bg-[rgba(242,244,243,0.035)] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">Current chapter</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--foreground)]">{activeScene.title}</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{activeScene.caption}</p>
            <div className="mt-5 rounded-2xl border border-[rgba(144,50,61,0.32)] bg-[rgba(144,50,61,0.1)] p-4">
              <p className="text-3xl font-semibold text-[var(--foreground)]">{activeScene.metric}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{activeScene.metricLabel}</p>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Link
                href="/demo/inbox"
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--moss)] px-5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Open demo workspace
              </Link>
              <Link
                href="/demo/dashboard"
                className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--line-strong)] px-5 text-sm font-semibold text-[var(--foreground)] transition-colors hover:border-[rgba(144,50,61,0.5)]"
              >
                View QA dashboard
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {SCENES.map((_, index) => (
              <SceneButton key={SCENES[index].id} index={index} active={index === active} onSelect={() => setActive(index)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
