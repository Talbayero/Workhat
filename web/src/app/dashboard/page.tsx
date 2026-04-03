import { insightCards } from "@/lib/mock-data";

const dashboardSections = [
  {
    title: "AI improvement trend",
    description:
      "Show whether draft quality is getting better over time by team, prompt version, and intent.",
  },
  {
    title: "Edit reason concentration",
    description:
      "Surface the policy, tone, and missing-context patterns driving the most human edits.",
  },
  {
    title: "Manager review queue",
    description:
      "Highlight high-risk threads and compare views that need QA or coaching attention.",
  },
];

export default function DashboardPage() {
  return (
    <main className="h-full overflow-y-auto scroll-soft p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <section className="grain-panel rounded-[28px] border border-[var(--line)] p-7">
          <p className="eyebrow text-[10px] text-[var(--muted)]">Dashboard</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Measure AI improvement, not just activity
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Milestone placeholder for the reporting layer. Metrics below reflect
            mock data from the current inbox shell.
          </p>

          {/* Insight cards (moved from inbox header) */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {insightCards.map((card) => (
              <div
                key={card.label}
                className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-4"
              >
                <p className="text-xs text-[var(--muted)]">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold">{card.value}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{card.delta}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Placeholder module cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {dashboardSections.map((section) => (
            <article
              key={section.title}
              className="grain-panel rounded-[24px] border border-[var(--line)] p-5"
            >
              <h2 className="text-base font-semibold">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {section.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
