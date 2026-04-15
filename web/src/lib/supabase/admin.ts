import { createClient } from "@supabase/supabase-js";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export type AdminClientResult =
  | { client: SupabaseAdminClient; reason: "service_role_key_valid"; keyRole: "service_role" }
  | { client: SupabaseAdminClient; reason: "secret_key_valid"; keyRole: "secret" }
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
 * be denied by RLS. Validate legacy JWT keys by role, and accept Supabase's
 * newer opaque secret keys (`sb_secret_...`) for server-side admin calls.
 */
export function createOptionalAdminClient(): AdminClientResult {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return { client: null, reason: "missing_env" };
  }

  const isSecretKey = key.startsWith("sb_secret_");
  const jwtRole = isSecretKey ? undefined : decodeSupabaseJwtRole(key);
  if (!isSecretKey && jwtRole !== "service_role") {
    return { client: null, reason: "invalid_service_role_key", keyRole: jwtRole };
  }

  if (isSecretKey) {
    try {
      return {
        client: createClient(url, key, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }),
        reason: "secret_key_valid",
        keyRole: "secret",
      };
    } catch {
      return { client: null, reason: "client_init_failed", keyRole: "secret" };
    }
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
    return { client: null, reason: "client_init_failed", keyRole: "service_role" };
  }
}
