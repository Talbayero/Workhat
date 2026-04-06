import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 * Use this in Client Components ("use client").
 *
 * Usage:
 *   const supabase = createClient();
 *   await supabase.auth.signInWithOtp({ email });
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
