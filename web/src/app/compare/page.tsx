import Link from "next/link";

function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(10,9,8,0.85)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[var(--line)] border border-[var(--line-strong)]">
            <img src="/logo.png" alt="Work Hat" className="h-5 w-5 object-contain drop-shadow-md" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Work Hat</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link href="/demo/inbox" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Demo</Link>
          <Link href="/compare" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">Compare</Link>
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
      workhat: { val: "Free (50 AI drafts/mo) → $49/mo Base + Usage", good: true },
      intercom: { val: "$74+/mo per seat + $0.99/resolution", good: false },
      zendesk: { val: "$69+/mo per agent + $50/mo AI Add-on", good: false },
      front: { val: "$19+/agent/mo", good: null },
    },
  ];

  const cols = ["Work Hat", "Intercom", "Zendesk", "Front"];

  return (
    <section className="px-6 py-20 min-h-[calc(100vh-160px)] flex flex-col justify-center">
      <div className="mx-auto max-w-5xl w-full">
        <div className="mb-10 max-w-2xl text-center mx-auto">
          <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">Compare</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Why ops leads outgrow the incumbents
          </h1>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            Most helpdesks just treat AI as a quick text generator. Work Hat is built specifically for teams that want full systemic control, letting you know exactly where your AI is failing — and proactively fixing it through self-learning.
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

        <p className="mt-4 text-center text-[10px] text-[var(--muted)]">
          Comparison based on publicly available documentation and pricing pages as of 2026. Work Hat is independently built and not affiliated with any compared product.
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
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
  );
}

export default function ComparePage() {
  return (
    <div className="min-h-screen">
      <NavBar />
      <main>
        <ComparisonTable />
      </main>
      <Footer />
    </div>
  );
}
