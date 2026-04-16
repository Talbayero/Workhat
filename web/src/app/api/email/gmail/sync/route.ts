import { NextResponse } from "next/server";
import {
  importRecentGmailInbox,
  markGmailSyncError,
  markGmailSyncSuccess,
  type EmailConnection,
} from "@/lib/email-connector/gmail-importer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AppUser = {
  id: string;
  org_id: string;
  role: string;
};

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .single();

  return data as AppUser | null;
}

export async function POST() {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "manager"].includes(appUser.role)) {
    return NextResponse.json({ error: "Only admins and managers can sync Gmail." }, { status: 403 });
  }

  const db = createAdminClient();
  const { data: connection, error: connectionError } = await db
    .from("email_connections")
    .select("id, org_id, provider_account_email, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, last_history_id")
    .eq("org_id", appUser.org_id)
    .eq("provider", "gmail")
    .eq("status", "connected")
    .limit(1)
    .single();

  if (connectionError || !connection) {
    return NextResponse.json({ error: "Connect Gmail before syncing." }, { status: 400 });
  }

  await db
    .from("email_connections")
    .update({ sync_status: "syncing", error_message: null })
    .eq("id", connection.id);

  try {
    const result = await importRecentGmailInbox({
      db,
      connection: connection as EmailConnection,
      maxResults: 10,
    });
    await markGmailSyncSuccess({ db, connectionId: connection.id, result });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail sync failed.";
    await markGmailSyncError({ db, connectionId: connection.id, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
