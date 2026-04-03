const dashboardSections = [
  {
    title: "AI improvement trend",
    description: "Show whether draft quality is getting better over time by team, prompt version, and intent.",
  },
  {
    title: "Edit reason concentration",
    description: "Surface the policy, tone, and missing-context patterns driving the most human edits.",
  },
  {
    title: "Manager review queue",
    description: "Highlight high-risk threads and compare views that need QA or coaching attention.",
  },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="grain-panel rounded-[32px] border border-[var(--line)] p-8">
          <p className="eyebrow text-xs text-[var(--muted)]">Dashboard</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Measure AI improvement, not just activity
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--muted)]">
            This is a milestone placeholder for the reporting layer. The design
            direction is already aligned with the PRD: make AI quality trends,
            failure reasons, and coaching opportunities easy to understand for a
            founder/operator-led team.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {dashboardSections.map((section) => (
              <article
                key={section.title}
                className="rounded-[26px] border border-[var(--line)] bg-[var(--panel-strong)] p-5"
              >
                <h2 className="text-xl font-semibold">{section.title}</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  {section.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
