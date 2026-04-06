import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieItem = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Server-side Supabase client.
 * Use this in Server Components, Route Handlers, and Server Actions.
 *
 * Usage:
 *   const supabase = await createClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieItem[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            );
          } catch {
            // setAll called from a Server Component — cookies can only
            // be set from middleware or Route Handlers. Safe to ignore.
          }
        },
      },
    }
  );
}
