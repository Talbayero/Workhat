"use client";

import { useState } from "react";
import Link from "next/link";

function FAQSection({ dict }: { dict: any }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="px-6 py-20 pb-32">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">{dict.faq.title}</h2>
        <div className="space-y-4">
          {dict.faq.items.map((faq: any, i: number) => (
            <div
              key={i}
              className="grain-panel overflow-hidden rounded-[16px] border border-[var(--line)] transition-colors hover:border-[var(--line-strong)]"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="flex w-full items-center justify-between px-6 py-5 text-left text-sm font-medium"
              >
                {faq.q}
                <span
                  className={`ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--line)] transition-transform duration-200 ${
                    openIndex === i ? "rotate-45" : ""
                  }`}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-60">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
              </button>
              {openIndex === i && (
                <div className="px-6 pb-6 text-sm leading-6 text-[var(--muted)]">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PricingClient({ dict }: { dict: any }) {
  const [annual, setAnnual] = useState(true);

  const plans = [
    {
      id: "free",
      name: dict.freeTier.name,
      tagline: dict.freeTier.tagline,
      monthlyPrice: 0,
      annualPrice: 0,
      priceLabel: "$0",
      annualPriceLabel: "$0",
      highlight: false,
      features: [
        dict.freeTier.seats,
        dict.freeTier.agents,
        dict.freeTier.drafts,
      ],
    },
    {
      id: "pro",
      name: dict.proTier.name,
      tagline: dict.proTier.tagline,
      monthlyPrice: 49,
      annualPrice: 39,
      priceLabel: "$49",
      annualPriceLabel: "$39",
      highlight: true,
      features: [
        dict.proTier.seats,
        dict.proTier.agents,
        dict.proTier.drafts,
        dict.proTier.overage,
      ],
    },
    {
      id: "scale",
      name: dict.scaleTier.name,
      tagline: dict.scaleTier.tagline,
      monthlyPrice: 199,
      annualPrice: 159,
      priceLabel: "$199",
      annualPriceLabel: "$159",
      highlight: false,
      features: [
        dict.scaleTier.seats,
        dict.scaleTier.agents,
        dict.scaleTier.drafts,
        dict.scaleTier.overage,
      ],
    },
  ];

  return (
    <main>
      <section className="px-6 pb-16 pt-20 text-center">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(144,50,61,0.14) 0%, transparent 60%)",
          }}
        />
        <p className="text-[10px] tracking-widest text-[var(--muted)]">{dict.eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
          {dict.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">
          {dict.desc}
        </p>

        <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] p-1">
          <button
            onClick={() => setAnnual(false)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              !annual ? "bg-[var(--moss)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {dict.toggle.monthly}
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              annual ? "bg-[var(--moss)] text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {dict.toggle.annual}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                annual
                  ? "bg-white/20 text-white"
                  : "bg-[rgba(144,50,61,0.15)] text-[var(--moss)]"
              }`}
            >
              {dict.toggle.save}
            </span>
          </button>
        </div>
      </section>

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
                    {dict.popular}
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
                    {dict.billedAnnually} (${plan.annualPrice * 12}/yr)
                  </p>
                )}
                {plan.monthlyPrice > 0 && !annual && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {dict.billedMonthly}
                  </p>
                )}
                {plan.monthlyPrice === 0 && (
                  <p className="mt-1 text-xs text-transparent">Free forever</p>
                )}
              </div>

              <div className="mt-8 flex-1">
                <ul className="space-y-3 text-sm text-[var(--muted)]">
                  {plan.features.map((feature: string) => (
                    <li key={feature} className="flex gap-3">
                      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--moss)]/20 text-[var(--moss)]">
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                          <path
                            d="M1 5l2.5 2.5L9 2"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                <Link
                  href="/onboarding"
                  className={`flex w-full justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                    plan.highlight
                      ? "bg-[var(--moss)] text-white shadow-[0_0_15px_rgba(144,50,61,0.3)] hover:opacity-90"
                      : "border border-[var(--line-strong)] bg-transparent text-[var(--foreground)] hover:bg-[var(--line)]"
                  }`}
                >
                  {dict.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <FAQSection dict={dict} />
    </main>
  );
}
