const setupSteps = [
  "Create organization profile",
  "Connect team inbox",
  "Upload SOPs and tone guides",
  "Invite agents and managers",
];

export default function OnboardingPage() {
  return (
    <main className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <section className="grain-panel rounded-[32px] border border-[var(--line)] p-8">
          <p className="eyebrow text-xs text-[var(--muted)]">Onboarding</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Get Work Hat ready for first replies
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">
            This route is the future handoff from auth into workspace setup.
            The sequence is shaped around the first buyer we chose: a
            founder/operator who needs fast setup and visible AI value.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {setupSteps.map((step, index) => (
              <div
                key={step}
                className="rounded-[26px] border border-[var(--line)] bg-[var(--panel-strong)] p-5"
              >
                <p className="eyebrow text-xs text-[var(--muted)]">
                  Step {index + 1}
                </p>
                <h2 className="mt-3 text-xl font-semibold">{step}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Placeholder surface for milestone follow-up work.
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
