import Link from "next/link";
import { AnimatedPreview } from "@/components/marketing/animated-preview";
import { WaitlistForm } from "@/components/marketing/waitlist-form";

/* ─────────────────────────────────────────────
   work-hat.com — Landing page
   Tone: Operator tool. Dense, direct, no fluff.
   Primary CTA: waitlist. Secondary: demo (mailto).
───────────────────────────────────────────── */

function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(10,9,8,0.85)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[var(--moss)]">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="4" width="12" height="9" rx="1.5" stroke="white" strokeWidth="1.5" />
              <path d="M1 8.5h3.5l1.5 1.5h3l1.5-1.5H13" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight">Work Hat</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link href="#how-it-works" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">How it works</Link>
          <Link href="#compare" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Compare</Link>
          <Link href="/pricing" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Pricing</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)] sm:block">
            Sign in
          </Link>
          <a
            href="mailto:teddyalbayero@work-hat.com?subject=Work Hat demo request"
            className="hidden rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--moss)] sm:block"
          >
            Book a demo
          </a>
          <Link
            href="#waitlist"
            className="rounded-full bg-[var(--moss)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Get early access
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-20">
      {/* Background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 55% at 50% -10%, rgba(144,50,61,0.24) 0%, transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-4xl">
        {/* Eyebrow */}
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 max-w-[40px] bg-[var(--line-strong)]" />
          <p className="text-[10px] font-medium tracking-[0.18em] text-[var(--muted)] uppercase">
            Support OS for ops leads
          </p>
          <div className="h-px flex-1 max-w-[40px] bg-[var(--line-strong)]" />
        </div>

        {/* Headline */}
        <h1 className="mt-5 text-5xl font-semibold leading-[1.06] tracking-[-0.02em] md:text-[64px]">
          Stop guessing why AI gets
          <br />
          <span className="text-[var(--moss)]">your replies wrong.</span>
        </h1>

        {/* Subheadline */}
        <p className="mt-5 max-w-2xl text-lg leading-7 text-[var(--muted)]">
          Built for ops leads who&apos;ve tried every AI reply tool and still end up rewriting everything.{" "}
          <span className="text-[var(--foreground)]">Work Hat tells you why.</span>
        </p>

        {/* Supporting detail — 3 tight proof points */}
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
          {[
            "Every edit your team makes is classified automatically",
            "AI reads the full customer + company context before drafting",
            "Dashboard shows exactly where the AI is failing — and why",
          ].map((point) => (
            <div key={point} className="flex items-center gap-2">
              <div className="h-1 w-1 shrink-0 rounded-full bg-[var(--moss)]" />
              <span className="text-sm text-[var(--muted)]">{point}</span>
            </div>
          ))}
        </div>

        {/* Dual CTA */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1 max-w-md">
            <WaitlistForm size="hero" placeholder="your@company.com" />
          </div>
          <div className="flex items-center gap-3 sm:flex-col sm:items-start">
            <span className="text-xs text-[var(--muted)] sm:hidden">or</span>
            <a
              href="mailto:teddyalbayero@work-hat.com?subject=Work Hat demo request"
              className="text-sm text-[var(--muted)] underline underline-offset-4 decoration-[var(--line-strong)] transition-colors hover:text-[var(--foreground)]"
            >
              Book a live demo →
            </a>
          </div>
        </div>

        {/* Trust line */}
        <p className="mt-4 text-xs text-[var(--muted)]">
          No credit card. No noise. We review every request.
        </p>
      </div>
    </section>
  );
}

function WalkthroughSection() {
  return (
    <section id="how-it-works" className="px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 max-w-xl">
          <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            The full loop — from email to insight
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Work Hat doesn&apos;t just draft replies. It captures what your team changes, classifies why, and builds a measurable record of AI quality over time.
          </p>
        </div>
        <AnimatedPreview />
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Email in. Context assembled.",
      body: "Inbound email lands, gets matched to the contact and company record, and every prior conversation is pulled. Risk level and intent are tagged before anyone opens the thread.",
    },
    {
      num: "02",
      title: "AI drafts using what it actually knows.",
      body: "The draft is built from 5 layers: your system behavior, org policy, knowledge base snippets, conversation history, and a structured output schema. Confidence score and risk flags are always surfaced — never hidden.",
    },
    {
      num: "03",
      title: "Agent edits. Everything is captured.",
      body: "When your team modifies the draft and sends, Work Hat runs a 3-step analysis: word-level diff, heuristic classifier, LLM verification. Edit type (tone, policy gap, factual error, full rewrite) and intensity score are stored permanently.",
    },
  ];

  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-px overflow-hidden rounded-[24px] border border-[var(--line)] sm:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.num}
              className={`grain-panel px-6 py-7 ${i < steps.length - 1 ? "border-b border-[var(--line)] sm:border-b-0 sm:border-r" : ""}`}
            >
              <p className="font-mono text-2xl font-semibold text-[rgba(144,50,61,0.35)]">{step.num}</p>
              <h3 className="mt-4 text-sm font-semibold leading-5">{step.title}</h3>
              <p className="mt-2 text-xs leading-[1.7] text-[var(--muted)]">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      title: "Context-aware AI drafts",
      body: "Every draft reads the full customer history, company tier, account owner, and your org policy. Not just the last message.",
    },
    {
      title: "Edit analysis pipeline",
      body: "3-step analysis on every send: diff → heuristic classification → LLM verification. Stores edit type and intensity permanently.",
    },
    {
      title: "AI improvement dashboard",
      body: "Acceptance rate, edit intensity, edit reason breakdown, and QA queue — all built from real send data. Not a guess.",
    },
    {
      title: "Knowledge base with semantic search",
      body: "Policy docs, SOPs, tone guides — stored, versioned, and retrieved by semantic search on every single draft.",
    },
    {
      title: "Risk and confidence scoring",
      body: "Every thread is scored before your team opens it. Red flags surface automatically. Low-confidence drafts are clearly marked.",
    },
    {
      title: "Multi-agent workspace",
      body: "Roles: admin, manager, agent, QA reviewer. Invite by email in seconds. Full audit trail per org.",
    },
  ];

  return (
    <section id="features" className="px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 max-w-xl">
          <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">Features</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Built for the ops lead who runs the whole support system
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div key={i} className="grain-panel rounded-[22px] border border-[var(--line)] px-5 py-5">
              <div className="mb-3 flex h-7 w-7 items-center justify-center rounded-[8px] border border-[rgba(144,50,61,0.3)] bg-[rgba(144,50,61,0.08)]">
                <span className="font-mono text-[10px] font-bold text-[var(--moss)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-[1.7] text-[var(--muted)]">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComparisonTable() {
  const rows = [
    {
      feature: "AI draft generation",
      workhat: { val: "Context-aware (history + policy + knowledge)", good: true },
      intercom: { val: "Copilot suggestions", good: null },
      zendesk: { val: "Basic macros + AI assist", good: null },
      front: { val: "AI drafts (no context depth)", good: null },
    },
    {
      feature: "Customer context in drafts",
      workhat: { val: "Full history, tier, company, policy", good: true },
      intercom: { val: "Partial — same session", good: null },
      zendesk: { val: "Ticket history only", good: null },
      front: { val: "Thread history", good: null },
    },
    {
      feature: "Edit capture + analysis",
      workhat: { val: "Yes — type, intensity, classification", good: true },
      intercom: { val: "No", good: false },
      zendesk: { val: "No", good: false },
      front: { val: "No", good: false },
    },
    {
      feature: "AI improvement tracking",
      workhat: { val: "Yes — dashboard + QA queue", good: true },
      intercom: { val: "No", good: false },
      zendesk: { val: "No", good: false },
      front: { val: "No", good: false },
    },
    {
      feature: "Knowledge base for drafts",
      workhat: { val: "Semantic search on every draft", good: true },
      intercom: { val: "Article suggestions", good: null },
      zendesk: { val: "Macros + article suggestions", good: null },
      front: { val: "Snippets only", good: null },
    },
    {
      feature: "Pricing entry point",
      workhat: { val: "Free tier → $49/mo", good: true },
      intercom: { val: "$74+/mo per seat", good: false },
      zendesk: { val: "$69+/mo per agent", good: false },
      front: { val: "$19+/agent/mo", good: null },
    },
  ];

  const cols = ["Work Hat", "Intercom", "Zendesk", "Front"];

  return (
    <section id="compare" className="px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 max-w-xl">
          <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">Compare</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Why ops leads outgrow the incumbents
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Intercom, Zendesk, and Front are built for volume. Work Hat is built for teams that want to know exactly where their AI is failing — and fix it.
          </p>
        </div>

        <div className="grain-panel overflow-hidden rounded-[24px] border border-[var(--line)]">
          {/* Header row */}
          <div className="grid grid-cols-5 border-b border-[var(--line)]">
            <div className="px-4 py-3" />
            {cols.map((col, i) => (
              <div
                key={col}
                className={`px-4 py-3 text-xs font-semibold ${
                  i === 0 ? "text-[var(--moss)]" : "text-[var(--muted)]"
                }`}
              >
                {col}
                {i === 0 && (
                  <span className="ml-2 rounded-full bg-[rgba(144,50,61,0.15)] border border-[rgba(144,50,61,0.3)] px-2 py-0.5 text-[9px]">
                    you
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Data rows */}
          {rows.map((row, ri) => (
            <div
              key={ri}
              className={`grid grid-cols-5 ${ri < rows.length - 1 ? "border-b border-[var(--line)]" : ""}`}
            >
              <div className="px-4 py-3.5 text-xs font-medium text-[var(--foreground)]">
                {row.feature}
              </div>
              {[row.workhat, row.intercom, row.zendesk, row.front].map((cell, ci) => (
                <div key={ci} className={`px-4 py-3.5 ${ci === 0 ? "bg-[rgba(144,50,61,0.04)]" : ""}`}>
                  <div className="flex items-start gap-1.5">
                    {cell.good === true && (
                      <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full bg-emerald-500/15 flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      </div>
                    )}
                    {cell.good === false && (
                      <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full bg-[rgba(144,50,61,0.15)] flex items-center justify-center">
                        <div className="h-0.5 w-2 rounded-full bg-[var(--moss)] opacity-60" />
                      </div>
                    )}
                    {cell.good === null && (
                      <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full bg-[var(--sage)] flex items-center justify-center">
                        <div className="h-1 w-1 rounded-full bg-[var(--muted)]" />
                      </div>
                    )}
                    <span className={`text-xs leading-5 ${ci === 0 ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
                      {cell.val}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <p className="mt-3 text-[10px] text-[var(--muted)]">
          Comparison based on publicly available documentation and pricing pages as of 2026. Work Hat is independently built and not affiliated with any compared product.
        </p>
      </div>
    </section>
  );
}

function WaitlistSection() {
  return (
    <section id="waitlist" className="relative px-6 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 55% 50% at 50% 100%, rgba(144,50,61,0.16) 0%, transparent 65%)",
        }}
      />
      <div className="relative mx-auto max-w-2xl text-center">
        <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">Early access</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight">
          Join the waitlist
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted)]">
          Work Hat is in early access. We review every request and onboard teams that are serious about measuring AI quality in their support operations.
        </p>

        <div className="mx-auto mt-8 max-w-md">
          <WaitlistForm size="section" />
        </div>

        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="h-px flex-1 max-w-[60px] bg-[var(--line)]" />
          <span className="text-xs text-[var(--muted)]">or</span>
          <div className="h-px flex-1 max-w-[60px] bg-[var(--line)]" />
        </div>

        <a
          href="mailto:teddyalbayero@work-hat.com?subject=Work Hat demo request"
          className="mt-4 inline-block text-sm text-[var(--muted)] underline underline-offset-4 decoration-[var(--line-strong)] transition-colors hover:text-[var(--foreground)]"
        >
          Talk to us directly — teddyalbayero@work-hat.com
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--line)] px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-8 sm:flex-row">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-[var(--moss)]">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="0.5" y="2.5" width="9" height="7" rx="1.2" stroke="white" strokeWidth="1.2" />
                <path d="M0.5 6h2.5l1 1h2l1-1H9.5" stroke="white" strokeWidth="1" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-[var(--foreground)]">Work Hat</span>
          </Link>
          <p className="mt-2 max-w-[200px] text-[11px] leading-5 text-[var(--muted)]">
            The support OS that tells you why your AI is wrong.
          </p>
        </div>

        <div className="flex flex-wrap gap-12">
          <div>
            <p className="mb-3 text-[10px] font-medium tracking-widest text-[var(--muted)] uppercase">Product</p>
            <nav className="flex flex-col gap-2">
              <Link href="#how-it-works" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">How it works</Link>
              <Link href="#features" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Features</Link>
              <Link href="#compare" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Compare</Link>
              <Link href="/pricing" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Pricing</Link>
            </nav>
          </div>
          <div>
            <p className="mb-3 text-[10px] font-medium tracking-widest text-[var(--muted)] uppercase">Account</p>
            <nav className="flex flex-col gap-2">
              <Link href="/login" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Sign in</Link>
              <Link href="#waitlist" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Get early access</Link>
              <a href="mailto:teddyalbayero@work-hat.com?subject=Work Hat demo request" className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Book a demo</a>
            </nav>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-5xl items-center justify-between border-t border-[var(--line)] pt-6 text-[10px] text-[var(--muted)]">
        <p>© {new Date().getFullYear()} Work Hat. All rights reserved.</p>
        <p>work-hat.com</p>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <NavBar />
      <main>
        <Hero />
        <WalkthroughSection />
        <HowItWorks />
        <Features />
        <ComparisonTable />
        <WaitlistSection />
      </main>
      <Footer />
    </div>
  );
}
