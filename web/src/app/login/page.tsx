"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error")
      ? decodeURIComponent(searchParams.get("error")!)
      : null
  );
  const [info, setInfo] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<"password" | "magic">("magic");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Email is required."); return; }
    if (!email.includes("@")) { setError("Enter a valid email address."); return; }

    setLoading(true);
    setError(null);
    setInfo(null);

    const supabase = createClient();

    if (mode === "magic") {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });
      setLoading(false);
      if (err) {
        setError(err.message);
      } else {
        setSent(true);
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (err) {
        setError(err.message);
      } else {
        router.push("/inbox");
        router.refresh();
      }
    }
  }

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <section className="grain-panel w-full max-w-md rounded-[32px] border border-[var(--line)] p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sage)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10l4 4 8-8" stroke="var(--moss)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-semibold">Check your email</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            We sent a sign-in link to <strong className="text-[var(--foreground)]">{email}</strong>. Click it to access Work Hat.
          </p>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Didn&apos;t get it?{" "}
            <button onClick={() => setSent(false)} className="text-[var(--moss)]">
              Resend
            </button>
          </p>
        </section>
      </main>
    );
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
            onClick={() => { setMode("magic"); setError(null); setInfo(null); }}
            className={`flex-1 rounded-full py-2 text-xs font-medium transition-colors ${
              mode === "magic"
                ? "bg-[var(--moss)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Magic link
          </button>
          <button
            type="button"
            onClick={() => { setMode("password"); setError(null); setInfo(null); }}
            className={`flex-1 rounded-full py-2 text-xs font-medium transition-colors ${
              mode === "password"
                ? "bg-[var(--moss)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Password
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
                <button
                  type="button"
                  onClick={() => { setMode("magic"); setInfo("Use a magic link to sign in without a password."); }}
                  className="text-[10px] text-[var(--moss)]"
                >
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

          {info && (
            <p className="rounded-[12px] border border-[rgba(169,146,125,0.35)] bg-[rgba(169,146,125,0.08)] px-4 py-3 text-xs text-[var(--foreground)]">
              {info}
            </p>
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
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
