import { createClient } from "@supabase/supabase-js";

export type AdminClientResult =
  | { client: ReturnType<typeof createClient>; reason: "service_role_key_valid"; keyRole: "service_role" }
  | { client: null; reason: "missing_env" | "invalid_service_role_key" | "client_init_failed"; keyRole?: string };

/**
 * Supabase admin client — uses the service role key.
 * Bypasses RLS. Only use in trusted server-side contexts (API routes, webhooks).
 * Never expose this client to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var is missing"
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function decodeSupabaseJwtRole(token: string | undefined): string | undefined {
  if (!token) return undefined;

  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      role?: string;
    };
    return decoded.role;
  } catch {
    return undefined;
  }
}

/**
 * Safe optional admin client.
 *
 * A common production setup mistake is pasting the anon key into
 * SUPABASE_SERVICE_ROLE_KEY. That key exists, but it is not admin and will still
 * be denied by RLS. Validate the JWT role before using it.
 */
export function createOptionalAdminClient(): AdminClientResult {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return { client: null, reason: "missing_env" };
  }

  const keyRole = decodeSupabaseJwtRole(key);
  if (keyRole !== "service_role") {
    return { client: null, reason: "invalid_service_role_key", keyRole };
  }

  try {
    return {
      client: createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }),
      reason: "service_role_key_valid",
      keyRole: "service_role",
    };
  } catch {
    return { client: null, reason: "client_init_failed", keyRole };
  }
}
