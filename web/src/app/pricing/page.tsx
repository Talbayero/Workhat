"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

/* ─────────────────────────────────────────────
   Work Hat — Pricing Page
   Public route, no sidebar
───────────────────────────────────────────── */

const plans = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Set up and test for free",
    monthlyPrice: 0,
    annualPrice: 0,
    priceLabel: "Free",
    annualPriceLabel: "Free",
    cta: "Get started",
    ctaHref: "/onboarding",
    highlight: false,
    features: [
      "Unlimited agent seats",
      "Unlimited conversations",
      "AI draft generation (50 / month)",
      "Intent classification & routing",
      "Self-learning corrections panel",
      "Knowledge base (Unlimited)",
      "AI improvement dashboard",
    ],
    missing: [
      "Over 50 AI drafts / month",
      "Priority support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Predictable base with flexible usage",
    monthlyPrice: 49,
    annualPrice: 39,
    priceLabel: "$49",
    annualPriceLabel: "$39",
    cta: "Join the waitlist",
    ctaHref: "/#waitlist",
    highlight: true,
    features: [
      "Unlimited agent seats",
      "Unlimited conversations",
      "500 AI drafts / mo included",
      "+ $0.10 per additional draft",
      "Intent classification & routing",
      "Self-learning corrections panel",
      "Knowledge base (Unlimited)",
      "AI improvement dashboard",
      "Gmail connector & Global search",
      "Priority email support",
    ],
    missing: [],
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "For high-volume ops teams",
    monthlyPrice: 149,
    annualPrice: 119,
    priceLabel: "$149",
    annualPriceLabel: "$119",
    cta: "Join the waitlist",
    ctaHref: "/#waitlist",
    highlight: false,
    features: [
      "Unlimited agent seats",
      "Unlimited conversations",
      "2500 AI drafts / mo included",
      "+ $0.08 per additional draft",
      "Full API & Webhooks access",
      "Custom AI configuration",
      "Custom role management",
      "Dedicated success manager",
    ],
    missing: [],
  },
];

const faqs = [
  {
    q: "Do I have to pay per human seat?",
    a: "No. Work Hat does not charge per human seat. You can invite your entire organization (managers, agents, QA reviewers) for free. We only charge a platform fee and usage based on the AI drafts generated.",
  },
  {
    q: "What counts as an AI draft?",
    a: "An AI draft is one instance of the AI generating a response or routing classification for a customer conversation. General chat in the system or human-only replies do not count towards your draft usage.",
  },
  {
    q: "How does the AI draft generation work?",
    a: "Each time an agent requests a draft, Work Hat assembles a 5-layer prompt: system behavior, org policy, knowledge snippets (retrieved by semantic search), full conversation context, and an output schema. The draft is generated via OpenAI's structured output API and stored with a confidence score and risk flags.",
  },
  {
    q: "What is 'edit analysis'?",
    a: "Every time an agent edits an AI draft and sends a reply, Work Hat runs a 3-step pipeline: a word-level diff, a heuristic classifier (detecting tone fixes, policy gaps, factual errors, etc.), and an LLM verification pass. Corrections feed into a self-learning panel so the AI improves over time.",
  },
  {
    q: "Can I upgrade or downgrade at any time?",
    a: "Yes. You can switch plans from your org settings at any time. When upgrading, you are charged the prorated difference immediately. When downgrading, the change takes effect at the end of the current billing period.",
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  async function handleUpgrade() {
    // During early access, all plans route to the waitlist
    router.push("/#waitlist");
    return;
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(10,9,8,0.85)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[var(--line)] border border-[var(--line-strong)]">
              <img src="/logo.png" alt="Work Hat" className="h-5 w-5 object-contain drop-shadow-md" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Work Hat</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <Link href="/#demo" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Demo</Link>
            <Link href="/#compare" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Compare</Link>
            <Link href="/pricing" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Pricing</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)] sm:block">
              Sign in
            </Link>
            <Link
              href="/demo/inbox"
              className="hidden rounded-full border border-[var(--moss)] px-4 py-2 text-sm font-medium text-[var(--moss)] transition-colors hover:bg-[var(--moss)] hover:text-white sm:block"
            >
              Try Demo
            </Link>
            <Link
              href="/onboarding"
              className="rounded-full bg-[var(--moss)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Header */}
        <section className="px-6 pb-16 pt-20 text-center">
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(144,50,61,0.14) 0%, transparent 60%)",
            }}
          />
          <p className="text-[10px] tracking-widest text-[var(--muted)]">PRICING</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Simple, honest pricing
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">
            Start free, upgrade when you need more. No seat taxes on conversations,
            no hidden AI call fees.
          </p>

          {/* Annual toggle */}
          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                !annual ? "bg-[var(--moss)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                annual ? "bg-[var(--moss)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Annual
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  annual
                    ? "bg-white/20 text-white"
                    : "bg-[rgba(144,50,61,0.15)] text-[var(--moss)]"
                }`}
              >
                Save 20%
              </span>
            </button>
          </div>
        </section>

        {/* Plans */}
        <section className="px-6 pb-20">
          <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-[28px] border p-6 ${
                  plan.highlight
                    ? "border-[rgba(144,50,61,0.5)] bg-[rgba(144,50,61,0.06)] shadow-[0_0_0_1px_rgba(144,50,61,0.15),0_24px_80px_rgba(0,0,0,0.5)]"
                    : "grain-panel border-[var(--line)]"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-[var(--moss)] px-3 py-1 text-[10px] font-semibold text-white">
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div>
                  <p className="text-[10px] tracking-widest text-[var(--muted)]">
                    {plan.name.toUpperCase()}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{plan.tagline}</p>

                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-4xl font-semibold tracking-tight">
                      {annual ? plan.annualPriceLabel : plan.priceLabel}
                    </span>
                    {plan.monthlyPrice > 0 && (
                      <span className="mb-1.5 text-sm text-[var(--muted)]">/mo</span>
                    )}
                  </div>
                  {plan.monthlyPrice > 0 && annual && (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Billed annually (${plan.annualPrice * 12}/yr)
                    </p>
                  )}
                  {plan.monthlyPrice > 0 && !annual && (
                    <p className="mt-1 text-xs text-[var(--muted)]">Billed monthly</p>
                  )}
                  {plan.monthlyPrice === 0 && (
                    <p className="mt-1 text-xs text-[var(--muted)]">Forever free</p>
                  )}
                </div>

                <button
                  onClick={handleUpgrade}
                  className={`mt-6 w-full rounded-full py-3 text-center text-sm font-medium transition-opacity hover:opacity-90 ${
                    plan.highlight
                      ? "bg-[var(--moss)] text-white"
                      : "border border-[var(--line-strong)] text-[var(--foreground)] hover:border-[var(--moss)]"
                  }`}
                >
                  {plan.cta}
                </button>

                <div className="mt-6 flex-1">
                  <p className="mb-3 text-[10px] tracking-widest text-[var(--muted)]">INCLUDES</p>
                  <ul className="space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          className="mt-0.5 shrink-0 text-[var(--moss)]"
                        >
                          <circle cx="7" cy="7" r="6" fill="currentColor" fillOpacity="0.15" />
                          <path
                            d="M4.5 7l2 2 3-3"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="text-xs leading-5 text-[var(--foreground)]">{f}</span>
                      </li>
                    ))}
                    {plan.missing.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          className="mt-0.5 shrink-0 text-[var(--muted)] opacity-40"
                        >
                          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
                          <path
                            d="M5 9l4-4M9 9L5 5"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="text-xs leading-5 text-[var(--muted)] opacity-50">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Enterprise */}
        <section className="px-6 pb-20">
          <div className="mx-auto max-w-5xl">
            <div className="grain-panel flex flex-col items-center justify-between gap-6 rounded-[28px] border border-[var(--line)] px-8 py-8 sm:flex-row">
              <div>
                <p className="text-[10px] tracking-widest text-[var(--muted)]">ENTERPRISE</p>
                <h3 className="mt-2 text-lg font-semibold">Need more than Scale?</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  Custom AI configuration, dedicated infrastructure, SSO, audit logs, and a
                  dedicated success manager.
                </p>
              </div>
              <a
                href="mailto:teddyalbayero@work-hat.com?subject=Work Hat Enterprise"
                className="shrink-0 rounded-full border border-[var(--line-strong)] px-6 py-3 text-sm font-medium transition-colors hover:border-[var(--moss)]"
              >
                Talk to us
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-6 pb-24">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight">
              Frequently asked questions
            </h2>
            <div className="space-y-2">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className="grain-panel rounded-[20px] border border-[var(--line)] overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="text-sm font-medium">{faq.q}</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      className={`shrink-0 text-[var(--muted)] transition-transform ${
                        openFaq === i ? "rotate-180" : ""
                      }`}
                    >
                      <path
                        d="M4 6l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {openFaq === i && (
                    <div className="border-t border-[var(--line)] px-5 pb-4 pt-3">
                      <p className="text-sm leading-6 text-[var(--muted)]">{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--line)] px-6 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 text-xs text-[var(--muted)] sm:flex-row">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-[var(--line)] border border-[var(--line-strong)]">
              <img src="/logo.png" alt="Work Hat" className="h-3.5 w-3.5 object-contain opacity-80" />
            </div>
            <span className="font-medium text-[var(--foreground)]">Work Hat</span>
          </Link>
          <nav className="flex gap-5">
            <Link href="/" className="transition-colors hover:text-[var(--foreground)]">Home</Link>
            <Link href="/login" className="transition-colors hover:text-[var(--foreground)]">Sign in</Link>
            <Link href="/onboarding" className="transition-colors hover:text-[var(--foreground)]">Get started</Link>
          </nav>
          <p>© {new Date().getFullYear()} Work Hat. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
