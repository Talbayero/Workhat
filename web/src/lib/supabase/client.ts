// Supabase browser client
// Phase 2: run `npm install @supabase/supabase-js` then uncomment the real import.
// For now the module is declared in package.json but not yet installed.

// import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[Work Hat] Supabase env vars not set. Running in mock-data mode. " +
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }
}

// Stub — replaced by createClient() once package is installed
export const supabase = {
  from: (_table: string) => ({ insert: async (_data: unknown) => ({ error: null }) }),
  auth: {
    signInWithPassword: async (_creds: { email: string; password: string }) => ({
      data: null,
      error: new Error("Supabase not yet installed. Run: npm install @supabase/supabase-js"),
    }),
    signInWithOtp: async (_opts: { email: string }) => ({
      data: null,
      error: new Error("Supabase not yet installed."),
    }),
    signOut: async () => ({ error: null }),
  },
} as const;
