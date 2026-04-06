"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function CallbackHandler() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // With implicit flow, Supabase detects access_token from the URL hash
    // automatically when detectSessionInUrl:true and fires onAuthStateChange.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.replace("/inbox");
      }
    });

    // Also check if a session already exists (e.g. revisiting callback URL)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/inbox");
      }
    });

    // Safety timeout — if nothing happens in 6 s, surface an error
    const timeout = setTimeout(() => {
      setError("Sign-in timed out. Please request a new magic link.");
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

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
