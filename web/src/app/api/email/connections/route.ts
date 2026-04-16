import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .single();

  return data as { id: string; org_id: string; role: string } | null;
}

export async function GET() {
  const appUser = await getAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_connections")
    .select(
      "id, provider, provider_account_email, display_name, status, sync_status, token_expires_at, last_history_id, watch_expires_at, last_sync_at, error_message, created_at, updated_at"
    )
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connections: data ?? [] });
}
