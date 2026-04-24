"use client";

// Note: metadata exports must be in Server Components. This page is "use client",
// so title is set via the root layout fallback ("Work Hat CRM") which is fine for login.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  friendlyAuthError,
  safeNext,
  validateAuthInput,
  type AuthMode,
} from "@/lib/auth/self-serve";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [mode, setMode] = useState<AuthMode>(
    searchParams.get("mode") === "signup"
      ? "signup"
      : searchParams.get("mode") === "reset"
      ? "reset"
      : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error")
      ? decodeURIComponent(searchParams.get("error")!)
      : null
  );
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setInfo(null);
    setConfirmPassword("");
  }

  async function routeAfterAuth() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      router.refresh();
      return;
    }

    const { data: appUser } = await supabase
      .from("users")
      .select("id, org_id")
      .eq("auth_user_id", user.id)
      .single();

    if (!appUser) {
      router.replace("/onboarding");
      router.refresh();
      return;
    }

    const { data: activeGmail } = await supabase
      .from("email_connections")
      .select("id")
      .eq("org_id", (appUser as { org_id: string }).org_id)
      .eq("provider", "gmail")
      .eq("connection_type", "oauth")
      .in("status", ["active", "connected"])
      .maybeSingle();

    router.replace(activeGmail ? next : "/onboarding?step=inbox");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateAuthInput({ mode, email, password, confirmPassword });
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);

    const supabase = createClient();

    if (mode === "forgot") {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/login?mode=reset")}`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      setLoading(false);
      if (resetError) {
        setError(friendlyAuthError(resetError.message));
        return;
      }
      setInfo("Password reset email sent. Open the link in that email to choose a new password.");
      return;
    }

    if (mode === "reset") {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      setLoading(false);
      if (updateError) {
        setError(friendlyAuthError(updateError.message));
        return;
      }
      setInfo("Password updated. Sign in with your new password.");
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
      return;
    }

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      setLoading(false);

      if (signInError) {
        setError(friendlyAuthError(signInError.message));
        return;
      }

      await routeAfterAuth();
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim() || email.split("@")[0],
        },
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(friendlyAuthError(signUpError.message));
      return;
    }

    if (!data.session) {
      setInfo(
        "Account created. Check your email to confirm the account, then sign in with your password."
      );
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
      return;
    }

    router.replace("/onboarding");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="grain-panel w-full max-w-md rounded-[32px] border border-[var(--line)] p-8">
        <p className="eyebrow text-[10px] text-[var(--muted)]">Work Hat</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {mode === "signup"
            ? "Create your Work Hat account"
            : mode === "forgot"
            ? "Reset your password"
            : mode === "reset"
            ? "Choose a new password"
            : "Sign in to Work Hat"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          This is your Work Hat login. It can be different from the support mailbox you connect later.
        </p>

        {mode !== "forgot" && mode !== "reset" && (
        <div className="mt-7 flex gap-1 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] p-1">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`flex-1 rounded-full py-2 text-xs font-medium transition-colors ${
              mode === "signin"
                ? "bg-[var(--moss)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`flex-1 rounded-full py-2 text-xs font-medium transition-colors ${
              mode === "signup"
                ? "bg-[var(--moss)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Create account
          </button>
        </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <div>
              <label htmlFor="fullName" className="eyebrow text-[10px] text-[var(--muted)]">
                Name
              </label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Teddy A"
                className="mt-1.5 w-full rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
              />
            </div>
          )}

          {mode !== "reset" && (
          <div>
            <label htmlFor="email" className="eyebrow text-[10px] text-[var(--muted)]">
              Work Hat login email
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
          )}

          {mode !== "forgot" && (
          <div>
            <label htmlFor="password" className="eyebrow text-[10px] text-[var(--muted)]">
              {mode === "reset" ? "New password" : "Password"}
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1.5 w-full rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--moss)] transition-colors"
            />
          </div>
          )}

          {(mode === "signup" || mode === "reset") && (
            <div>
              <label htmlFor="confirmPassword" className="eyebrow text-[10px] text-[var(--muted)]">
                Confirm {mode === "reset" ? "new password" : "password"}
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
            <p role="alert" className="rounded-[12px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--moss)] px-5 py-3 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {loading
              ? mode === "signup"
                ? "Creating account..."
                : mode === "forgot"
                ? "Sending reset email..."
                : mode === "reset"
                ? "Updating password..."
                : "Signing in..."
              : mode === "signup"
              ? "Create account"
              : mode === "forgot"
              ? "Send reset email"
              : mode === "reset"
              ? "Update password"
              : "Sign in"}
          </button>
        </form>

        {mode === "signin" && (
          <p className="mt-4 text-center text-xs">
            <button type="button" onClick={() => switchMode("forgot")} className="text-[var(--moss)]">
              Forgot your password?
            </button>
          </p>
        )}

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          {mode === "signup" ? "Already have an account?" : mode === "signin" ? "New to Work Hat?" : "Back to sign in?"}{" "}
          <button
            type="button"
            onClick={() => switchMode(mode === "signup" || mode === "forgot" || mode === "reset" ? "signin" : "signup")}
            className="text-[var(--moss)]"
          >
            {mode === "signup" || mode === "forgot" || mode === "reset" ? "Sign in" : "Create an account"}
          </button>
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
