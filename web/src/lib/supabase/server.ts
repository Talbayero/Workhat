// Supabase server client (for Route Handlers and Server Components)
// Phase 2: run `npm install @supabase/supabase-js` then uncomment real implementation.

// import { createClient } from "@supabase/supabase-js";

export function createServerSupabaseClient() {
  // Stub — replaced by real createClient() once @supabase/supabase-js is installed
  return {
    from: (_table: string) => ({
      insert: async (_data: unknown) => ({ error: null }),
      select: async () => ({ data: [], error: null }),
    }),
  };
}
