"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Auth callback handler.
 *
 * After Supabase confirms the magic link / invite:
 *   1. Check if the user has an app `users` row
 *   2. If yes → go to inbox (or the ?next= param)
 *   3. If no → go to onboarding (brand new user)
 *
 * Invite flow: when ?invite=1 is present, the invited user's pending `users`
 * row needs to be activated by linking it to their new auth_user_id.
 */
/** Only allow same-origin redirect targets — block open-redirect attacks. */
function safeNext(raw: string | null, fallback = "/inbox"): string {
  if (!raw) return fallback;
  // Must start with / and not be a protocol-relative URL (//evil.com)
  if (/^\/[^/]/.test(raw) || raw === "/") return raw;
  return fallback;
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const isInvite = searchParams.get("invite") === "1";
    const next = safeNext(searchParams.get("next"));

    async function handleSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // wait for onAuthStateChange

      const user = session.user;

      // Check if this auth user already has an app users row
      const { data: appUser } = await supabase
        .from("users")
        .select("id, status")
        .eq("auth_user_id", user.id)
        .single();

      if (appUser) {
        // Existing user — go to intended destination
        router.replace(next);
        return;
      }

      if (isInvite && user.email) {
        // Invited user: find their pending row by email and link auth_user_id
        const { data: pending } = await supabase
          .from("users")
          .select("id")
          .eq("email", user.email)
          .eq("status", "pending")
          .single();

        if (pending) {
          await supabase
            .from("users")
            .update({
              auth_user_id: user.id,
              status: "active",
              full_name:
                user.user_metadata?.full_name ??
                user.email?.split("@")[0] ??
                "Team member",
            })
            .eq("id", (pending as { id: string }).id);

          router.replace("/inbox");
          return;
        }
      }

      // Brand new user with no org — send to onboarding
      router.replace("/onboarding");
    }

    // Detect session from URL hash (magic link / PKCE)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) handleSession();
      }
    );

    // Also handle case where session is already present
    handleSession();

    const timeout = setTimeout(() => {
      setError("Sign-in timed out. Please request a new magic link.");
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-[24px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] p-8 text-center">
          <p className="text-sm">{error}</p>
          <button
            onClick={() => router.replace("/login")}
            className="mt-4 rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white"
          >
            Back to login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--moss)] border-t-transparent" />
        <p className="mt-4 text-sm text-[var(--muted)]">Signing you in…</p>
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  );
}
