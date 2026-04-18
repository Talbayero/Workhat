"use client";

import { useEffect } from "react";

type ErrorFallbackProps = {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  /** If true, renders as a compact inline panel instead of full-height centered */
  inline?: boolean;
};

/**
 * Shared error UI used by Next.js error.tsx segment boundaries and the
 * standalone ErrorBoundary component. Displays a user-friendly message
 * with a retry button, and logs the error to the console.
 */
export function ErrorFallback({ error, reset, title, inline = false }: ErrorFallbackProps) {
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  const heading = title ?? "Something went wrong";

  if (inline) {
    return (
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3 flex items-center gap-3">
        <span className="text-[var(--moss)] text-lg select-none">⚠</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--foreground)]">{heading}</p>
          {error.digest && (
            <p className="text-xs text-[var(--muted)] mt-0.5 font-mono">ref: {error.digest}</p>
          )}
        </div>
        <button
          onClick={reset}
          className="shrink-0 text-xs px-2.5 py-1 rounded bg-[var(--panel-strong)] border border-[var(--line)] text-[var(--foreground)] hover:border-[var(--line-strong)] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center gap-4">
      <div className="w-12 h-12 rounded-full bg-[var(--rose)] flex items-center justify-center">
        <span className="text-[var(--moss)] text-xl select-none">⚠</span>
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--foreground)]">{heading}</h2>
        <p className="text-sm text-[var(--muted)] max-w-xs">
          An unexpected error occurred. Your data is safe — try refreshing or click retry.
        </p>
        {error.digest && (
          <p className="text-xs text-[var(--muted)] font-mono mt-1">ref: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-[var(--moss)] text-white text-sm font-medium hover:bg-[var(--moss-strong)] transition-colors"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.assign("/")}
          className="px-4 py-2 rounded-lg border border-[var(--line)] text-[var(--muted)] text-sm hover:border-[var(--line-strong)] hover:text-[var(--foreground)] transition-colors"
        >
          Go home
        </button>
      </div>
    </div>
  );
}
