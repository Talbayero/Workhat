"use client";

export function SearchShell({ isDemo = false, baseDir = "" }: { isDemo?: boolean; baseDir?: string }) {
  return (
    <form action={`${baseDir}/search`} className="flex h-full items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <p className="eyebrow text-[10px] text-[var(--muted)]">
          {isDemo ? "Demo workspace" : "Workspace"} / Search
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Search</h2>
        <p className="mt-3 text-[var(--muted)]">
          Search across conversations, contacts, companies, and knowledge entries.
        </p>
        <div className="mt-6 flex gap-2">
          <input
            name="q"
            type="search"
            placeholder="Search everything..."
            className="w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 outline-none focus:border-[var(--moss)]"
          />
          <button
            type="submit"
            className="rounded-[14px] bg-[var(--moss)] px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Search
          </button>
        </div>
        {isDemo && (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Demo search routes back into the demo workspace and does not touch customer data.
          </p>
        )}
      </div>
    </form>
  );
}
