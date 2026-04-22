export default function AuditLoading() {
  return (
    <div className="scroll-soft h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-5">
        <div className="rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-6">
          <div className="h-3 w-28 animate-pulse rounded-full bg-[var(--sage)]" />
          <div className="mt-4 h-8 w-80 max-w-full animate-pulse rounded-full bg-[var(--sage)]" />
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-[18px] border border-[var(--line)] bg-[rgba(255,255,255,0.025)]" />
            ))}
          </div>
        </div>
        <div className="h-36 animate-pulse rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)]" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-44 animate-pulse rounded-[22px] border border-[var(--line)] bg-[var(--panel-strong)]" />
        ))}
      </div>
    </div>
  );
}
