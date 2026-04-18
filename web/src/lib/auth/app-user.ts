import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CurrentAppUser = {
  id: string;
  org_id: string;
  role: string;
  full_name?: string;
};

type GetCurrentAppUserOptions = {
  label: string;
  select?: string;
};

/**
 * Resolve the signed-in Supabase auth user to the app's public.users row.
 *
 * We verify the browser session with the normal Supabase client, then fall back
 * to the server admin client for the app-user lookup. This keeps trusted API
 * routes resilient when production RLS policies block the self-lookup.
 */
export async function getCurrentAppUser<T extends CurrentAppUser = CurrentAppUser>({
  label,
  select = "id, org_id, role",
}: GetCurrentAppUserOptions): Promise<T | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select(select)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!error && data) {
    return data as unknown as T;
  }

  if (error) {
    console.warn(`[${label}] app user lookup via RLS client failed:`, error.message);
  }

  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.error(`[${label}] admin app user lookup unavailable:`, adminState.reason);
    return null;
  }

  const { data: adminData, error: adminError } = await adminState.client
    .from("users")
    .select(select)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (adminError) {
    console.error(`[${label}] admin app user lookup failed:`, adminError.message);
    return null;
  }

  return (adminData as unknown as T | null) ?? null;
}
