"use client";

import { useState, useEffect } from "react";

/* ─────────────────────────────────────────────
   AnimatedPreview
   3-frame walkthrough cycling automatically.
   Frame 1: Email arrives in inbox
   Frame 2: AI draft with context panel open
   Frame 3: Edit captured + dashboard metric
───────────────────────────────────────────── */

const FRAMES = [
  {
    step: "01",
    label: "Email arrives",
    caption: "Every inbound message is parsed, risk-scored, and matched to the right contact and company before your team touches it.",
  },
  {
    step: "02",
    label: "AI drafts using full context",
    caption: "Work Hat reads the customer's history, company tier, and your org policy before writing. Confidence score and risk flags are always visible.",
  },
  {
    step: "03",
    label: "Every edit is captured",
    caption: "When your team modifies the draft, the change is classified — tone fix, policy gap, missing context. The AI gets measurably better over time.",
  },
];

function Frame1() {
  return (
    <div className="flex h-full overflow-hidden rounded-[20px] bg-[#0d0c0b]">
      {/* Sidebar stub */}
      <div className="hidden w-[160px] shrink-0 border-r border-[var(--line)] px-3 py-4 sm:block">
        <div className="mb-4 space-y-1">
          <div className="h-2 w-14 rounded-full bg-[var(--line-strong)]" />
          <div className="h-1.5 w-20 rounded-full bg-[var(--line)]" />
        </div>
        {["Inbox", "Contacts", "Companies", "Knowledge", "Dashboard"].map((item, i) => (
          <div
            key={item}
            className={`mb-0.5 flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs ${
              i === 0 ? "bg-[var(--moss)] text-white" : "text-[var(--muted)]"
            }`}
          >
            <div className="h-2.5 w-2.5 rounded-sm bg-current opacity-50" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      {/* Inbox list */}
      <div className="flex min-w-0 flex-1 flex-col border-r border-[var(--line)] px-3 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-2 w-24 rounded-full bg-[var(--line-strong)]" />
          <div className="rounded-full bg-[rgba(144,50,61,0.18)] border border-[rgba(144,50,61,0.3)] px-2 py-0.5 text-[10px] text-[var(--moss)]">3 new</div>
        </div>

        {/* Highlighted new message */}
        <div className="mb-2 animate-pulse rounded-[14px] border border-[rgba(144,50,61,0.4)] bg-[rgba(144,50,61,0.08)] p-3 ring-1 ring-[rgba(144,50,61,0.2)]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-[var(--moss)]" />
                <div className="h-2 w-20 rounded-full bg-[var(--line-strong)]" />
              </div>
              <div className="mt-1 h-1.5 w-32 rounded-full bg-[var(--line-strong)]" />
            </div>
            <div className="h-4 w-4 shrink-0 rounded-full bg-[rgba(144,50,61,0.3)]" />
          </div>
          <div className="mt-2 space-y-1">
            <div className="h-1.5 w-full rounded-full bg-[var(--line)]" />
            <div className="h-1.5 w-4/5 rounded-full bg-[var(--line)]" />
          </div>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded-full bg-[var(--sage)] px-2 py-0.5 text-[9px] text-[var(--muted)]">billing</span>
            <span className="rounded-full bg-[rgba(144,50,61,0.12)] border border-[rgba(144,50,61,0.25)] px-2 py-0.5 text-[9px] text-[var(--moss)]">high risk</span>
          </div>
        </div>

        {[1, 2, 3].map((i) => (
          <div key={i} className="mb-1.5 rounded-[12px] border border-[var(--line)] bg-[var(--sage)] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="h-1.5 w-16 rounded-full bg-[var(--line-strong)]" />
              <div className={`h-1.5 w-1.5 rounded-full ${i === 1 ? "bg-[var(--amber)]" : "bg-emerald-500"}`} />
            </div>
            <div className="mt-1 h-1.5 w-28 rounded-full bg-[var(--line)]" />
          </div>
        ))}
      </div>

      {/* Empty thread pane */}
      <div className="hidden flex-1 items-center justify-center md:flex">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 rounded-full border border-[var(--line)] bg-[var(--sage)]" />
          <div className="mt-3 h-1.5 w-24 rounded-full bg-[var(--line)] mx-auto" />
          <div className="mt-1.5 h-1.5 w-16 rounded-full bg-[var(--line)] mx-auto" />
        </div>
      </div>
    </div>
  );
}

function Frame2() {
  return (
    <div className="flex h-full overflow-hidden rounded-[20px] bg-[#0d0c0b]">
      {/* Narrow sidebar */}
      <div className="hidden w-[160px] shrink-0 border-r border-[var(--line)] px-3 py-4 sm:block">
        <div className="mb-4 space-y-1">
          <div className="h-2 w-14 rounded-full bg-[var(--line-strong)]" />
          <div className="h-1.5 w-20 rounded-full bg-[var(--line)]" />
        </div>
        {["Inbox", "Contacts", "Companies", "Knowledge", "Dashboard"].map((item, i) => (
          <div key={item} className={`mb-0.5 flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs ${i === 0 ? "bg-[var(--moss)] text-white" : "text-[var(--muted)]"}`}>
            <div className="h-2.5 w-2.5 rounded-sm bg-current opacity-50" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col px-4 py-4">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="h-2.5 w-36 rounded-full bg-[var(--line-strong)]" />
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 w-20 rounded-full bg-[var(--line)]" />
              <span className="rounded-full bg-[rgba(144,50,61,0.12)] border border-[rgba(144,50,61,0.25)] px-2 py-0.5 text-[9px] text-[var(--moss)]">high risk</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <div className="h-7 w-24 rounded-full border border-[var(--line-strong)] bg-[var(--sage)]" />
            <div className="flex h-7 items-center gap-1.5 rounded-full bg-[var(--moss)] px-3">
              <div className="h-1.5 w-1.5 rounded-full bg-white opacity-70" />
              <div className="h-1.5 w-12 rounded-full bg-white opacity-70" />
            </div>
          </div>
        </div>

        {/* Inbound message */}
        <div className="mb-3 flex justify-start">
          <div className="max-w-[65%] rounded-[16px] border border-[var(--line)] bg-[var(--sage)] p-3">
            <div className="mb-1.5 h-1.5 w-20 rounded-full bg-[var(--line-strong)]" />
            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-[var(--line-strong)]" />
              <div className="h-1.5 w-5/6 rounded-full bg-[var(--line-strong)]" />
              <div className="h-1.5 w-4/6 rounded-full bg-[var(--line-strong)]" />
            </div>
          </div>
        </div>

        {/* AI Draft panel — highlighted */}
        <div className="rounded-[16px] border border-[rgba(144,50,61,0.45)] bg-[rgba(144,50,61,0.07)] p-3.5 shadow-[0_0_0_1px_rgba(144,50,61,0.08)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[var(--moss)]" />
              <span className="text-[10px] font-semibold text-[var(--moss)]">AI Draft · High confidence</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] text-emerald-400">policy match</span>
              <span className="rounded-full bg-[var(--sage)] px-2 py-0.5 text-[9px] text-[var(--muted)]">2 tags</span>
            </div>
          </div>

          {/* Context chips */}
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {["Acme Corp · Enterprise", "6 prior threads", "Billing tier: Pro"].map((chip) => (
              <span key={chip} className="rounded-full border border-[var(--line)] bg-[var(--sage)] px-2 py-0.5 text-[9px] text-[var(--muted)]">{chip}</span>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-[rgba(144,50,61,0.22)]" />
            <div className="h-1.5 w-11/12 rounded-full bg-[rgba(144,50,61,0.22)]" />
            <div className="h-1.5 w-4/5 rounded-full bg-[rgba(144,50,61,0.22)]" />
            <div className="h-1.5 w-3/5 rounded-full bg-[rgba(144,50,61,0.22)]" />
          </div>

          <div className="mt-3 flex gap-2">
            <div className="flex h-7 items-center gap-1.5 rounded-full bg-[var(--moss)] px-3">
              <div className="h-1.5 w-12 rounded-full bg-white opacity-70" />
            </div>
            <div className="h-7 w-20 rounded-full border border-[var(--line-strong)] bg-[var(--sage)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Frame3() {
  return (
    <div className="flex h-full overflow-hidden rounded-[20px] bg-[#0d0c0b]">
      <div className="hidden w-[160px] shrink-0 border-r border-[var(--line)] px-3 py-4 sm:block">
        <div className="mb-4 space-y-1">
          <div className="h-2 w-14 rounded-full bg-[var(--line-strong)]" />
          <div className="h-1.5 w-20 rounded-full bg-[var(--line)]" />
        </div>
        {["Inbox", "Contacts", "Companies", "Knowledge", "Dashboard"].map((item, i) => (
          <div key={item} className={`mb-0.5 flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs ${i === 4 ? "bg-[var(--moss)] text-white" : "text-[var(--muted)]"}`}>
            <div className="h-2.5 w-2.5 rounded-sm bg-current opacity-50" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col px-4 py-4">
        {/* Metric cards */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            { label: "AI acceptance", value: "74%", color: "text-emerald-400" },
            { label: "Avg edit intensity", value: "12%", color: "text-[var(--foreground)]" },
            { label: "Top gap", value: "Policy", color: "text-[var(--moss)]" },
          ].map((m) => (
            <div key={m.label} className="rounded-[14px] border border-[var(--line)] bg-[var(--sage)] p-2.5">
              <div className="h-1.5 w-16 rounded-full bg-[var(--line)]" />
              <p className={`mt-2 text-lg font-semibold ${m.color}`}>{m.value}</p>
              <p className="mt-0.5 text-[9px] text-[var(--muted)]">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Edit reason bars */}
        <div className="mb-3 rounded-[14px] border border-[var(--line)] bg-[var(--sage)] p-3">
          <div className="mb-2.5 h-1.5 w-28 rounded-full bg-[var(--line-strong)]" />
          {[
            { label: "Policy gap", pct: 38, color: "bg-[var(--moss)]" },
            { label: "Tone fix", pct: 27, color: "bg-[var(--amber)]" },
            { label: "Missing context", pct: 19, color: "bg-[var(--amber)]" },
            { label: "Accepted", pct: 16, color: "bg-emerald-500" },
          ].map((bar) => (
            <div key={bar.label} className="mb-2 flex items-center gap-2">
              <div className="w-24 shrink-0 text-[9px] text-[var(--muted)]">{bar.label}</div>
              <div className="flex-1 overflow-hidden rounded-full bg-[var(--line)]" style={{ height: 5 }}>
                <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.pct}%` }} />
              </div>
              <div className="w-6 text-right text-[9px] text-[var(--muted)]">{bar.pct}%</div>
            </div>
          ))}
        </div>

        {/* Captured edit */}
        <div className="rounded-[14px] border border-[rgba(144,50,61,0.3)] bg-[rgba(144,50,61,0.06)] p-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--moss)]" />
            <span className="text-[9px] font-medium text-[var(--moss)]">Latest edit captured · Policy gap · 18% intensity</span>
          </div>
          <div className="mt-2 space-y-1">
            <div className="h-1.5 w-full rounded-full bg-[var(--line)]" />
            <div className="h-1.5 w-3/4 rounded-full bg-[var(--line)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

const frameComponents = [Frame1, Frame2, Frame3];

export function AnimatedPreview() {
  const [active, setActive] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setActive((prev) => (prev + 1) % FRAMES.length);
        setAnimating(false);
      }, 250);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const FrameComponent = frameComponents[active];

  return (
    <div className="mx-auto max-w-5xl">
      {/* Step labels */}
      <div className="mb-5 flex items-center justify-center gap-2">
        {FRAMES.map((f, i) => (
          <button
            key={i}
            onClick={() => {
              setAnimating(true);
              setTimeout(() => { setActive(i); setAnimating(false); }, 200);
            }}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
              i === active
                ? "border-[rgba(144,50,61,0.5)] bg-[rgba(144,50,61,0.12)] text-[var(--foreground)]"
                : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--foreground)]"
            }`}
          >
            <span className={`font-mono text-[10px] ${i === active ? "text-[var(--moss)]" : "text-[var(--muted)]"}`}>
              {f.step}
            </span>
            {f.label}
          </button>
        ))}
      </div>

      {/* Preview window */}
      <div className="grain-panel rounded-[28px] border border-[var(--line)] p-1 shadow-[0_40px_120px_rgba(0,0,0,0.65)]">
        <div
          className="h-[380px] transition-opacity duration-200"
          style={{ opacity: animating ? 0 : 1 }}
        >
          <FrameComponent />
        </div>
      </div>

      {/* Caption */}
      <p
        className="mx-auto mt-5 max-w-lg text-center text-sm leading-6 text-[var(--muted)] transition-opacity duration-200"
        style={{ opacity: animating ? 0 : 1 }}
      >
        {FRAMES[active].caption}
      </p>

      {/* Progress dots */}
      <div className="mt-4 flex justify-center gap-2">
        {FRAMES.map((_, i) => (
          <button
            key={i}
            onClick={() => { setAnimating(true); setTimeout(() => { setActive(i); setAnimating(false); }, 200); }}
            className={`rounded-full transition-all ${
              i === active ? "h-1.5 w-6 bg-[var(--moss)]" : "h-1.5 w-1.5 bg-[var(--line-strong)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
