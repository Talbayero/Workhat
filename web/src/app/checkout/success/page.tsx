import Link from "next/link";

/* ─────────────────────────────────────────────
   /checkout/success
   Shown after Stripe Checkout completes.
   The sidebar is hidden for /checkout via AppShell.
───────────────────────────────────────────── */

export default function CheckoutSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        {/* Check mark */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)]">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path
              d="M6 14l5 5 11-11"
              stroke="#22c55e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">You&apos;re all set</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Your 14-day free trial has started. Your team can start using the inbox, AI drafts,
          and analytics right now.
        </p>

        <div className="grain-panel mt-8 rounded-[24px] border border-[var(--line)] p-5 text-left">
          <p className="text-[10px] tracking-widest text-[var(--muted)]">WHAT&apos;S NEXT</p>
          <ul className="mt-3 space-y-3">
            {[
              "Invite your team in Settings → Team",
              "Add knowledge entries to power AI drafts",
              "Set up your inbound email channel",
              "Open the inbox and generate your first AI draft",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--moss)] text-[10px] font-semibold text-white">
                  {i + 1}
                </span>
                <span className="text-sm leading-5">{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/inbox"
            className="block rounded-full bg-[var(--moss)] py-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Open the inbox
          </Link>
          <Link
            href="/settings"
            className="block rounded-full border border-[var(--line-strong)] py-3.5 text-sm font-medium transition-colors hover:border-[var(--moss)]"
          >
            Go to settings
          </Link>
        </div>
      </div>
    </main>
  );
}
