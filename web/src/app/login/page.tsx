"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"password" | "magic">("password");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    // Phase 2: replace with supabase.auth.signInWithPassword / signInWithOtp
    await new Promise((r) => setTimeout(r, 700));
    router.push("/inbox");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="grain-panel w-full max-w-md rounded-[32px] border border-[var(--line)] p-8">
        <p className="eyebrow text-[10px] text-[var(--muted)]">Work Hat</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Sign in to your support OS
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          AI-first CRM for support and ops teams.
        </p>

        {/* Mode toggle */}
        <div className="mt-7 flex gap-1 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] p-1">
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`flex-1 rounded-full py-2 text-xs font-medium transition-colors ${
              mode === "password"
                ? "bg-[var(--moss)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => setMode("magic")}
            className={`flex-1 rounded-full py-2 text-xs font-medium transition-colors ${
              mode === "magic"
                ? "bg-[var(--moss)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Magic link
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="email" className="eyebrow text-[10px] text-[var(--muted)]">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourteam.com"
              className="mt-1.5 w-full rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
            />
          </div>

          {mode === "password" && (
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="eyebrow text-[10px] text-[var(--muted)]">
                  Password
                </label>
                <button type="button" className="text-[10px] text-[var(--moss)]">
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
              />
            </div>
          )}

          {error && (
            <p className="rounded-[12px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--moss)] px-5 py-3 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {loading
              ? mode === "magic" ? "Sending link…" : "Signing in…"
              : mode === "magic" ? "Send magic link" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          Don&apos;t have an account?{" "}
          <Link href="/onboarding" className="text-[var(--moss)]">
            Request access
          </Link>
        </p>

        <div className="mt-5 rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
          <p className="text-[10px] text-[var(--muted)]">
            Dev mode — any valid email grants access. Supabase auth wires in Phase 2.
          </p>
        </div>
      </section>
    </main>
  );
}
