import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--sage)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 8v5M12 17h.01"
              stroke="var(--muted)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="9" stroke="var(--muted)" strokeWidth="1.5" />
          </svg>
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Payment cancelled</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          No charge was made. Your account remains on the Starter plan. You can upgrade any time.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/pricing"
            className="block rounded-full bg-[var(--moss)] py-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Back to pricing
          </Link>
          <Link
            href="/inbox"
            className="block rounded-full border border-[var(--line-strong)] py-3.5 text-sm font-medium transition-colors hover:border-[var(--moss)]"
          >
            Continue with Starter
          </Link>
        </div>
      </div>
    </main>
  );
}
