"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");

    if (!code) {
      router.replace("/login?error=no_code");
      return;
    }

    const supabase = createClient();

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        console.error("[auth/callback] exchange failed:", error.message);
        setStatus("error");
        setErrorMsg(error.message);
        // Give user a moment to see the message, then redirect
        setTimeout(() => {
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
        }, 1500);
      } else {
        router.replace("/inbox");
      }
    });
  }, [router, searchParams]);

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-[24px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] p-8 text-center">
          <p className="text-sm text-[var(--muted)]">Sign-in failed: {errorMsg}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">Redirecting back to login…</p>
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
