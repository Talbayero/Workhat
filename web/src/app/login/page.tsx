import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="grain-panel w-full max-w-md rounded-[32px] border border-[var(--line)] p-8">
        <p className="eyebrow text-xs text-[var(--muted)]">Work Hat CRM</p>
        <h1 className="mt-3 text-3xl font-semibold">Sign in to the support OS</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Auth wiring comes in the next implementation slice. This page is here
          so the route structure matches the Milestone 1 shell.
        </p>

        <div className="mt-8 space-y-4">
          <div className="rounded-[22px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--muted)]">
            Email input placeholder
          </div>
          <div className="rounded-[22px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--muted)]">
            Password or magic-link placeholder
          </div>
          <button className="w-full rounded-full bg-[var(--moss)] px-5 py-3 text-sm font-medium text-white">
            Continue
          </button>
        </div>

        <Link href="/inbox" className="mt-6 inline-flex text-sm text-[var(--moss)]">
          Return to inbox shell
        </Link>
      </section>
    </main>
  );
}
