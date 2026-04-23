import { NextResponse } from "next/server";
import {
  importRecentGmailInbox,
  markGmailSyncError,
  markGmailSyncSuccess,
  type EmailConnection,
} from "@/lib/email-connector/gmail-importer";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const appUser = await getCurrentAppUser({ label: "gmail/sync" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireCapability(appUser, "integrations.manage", "gmail/sync");
  if (denied) return denied;

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[gmail/sync] admin client init failed:", message);
    return NextResponse.json({ error: "Gmail sync is unavailable — admin database key is not configured." }, { status: 503 });
  }

  const { data: connection, error: connectionError } = await db
    .from("email_connections")
    .select("id, org_id, provider_account_email, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, last_history_id")
    .eq("org_id", appUser.org_id)
    .eq("provider", "gmail")
    .eq("connection_type", "oauth")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();

  if (connectionError || !connection) {
    return NextResponse.json({ error: "Connect Gmail before syncing." }, { status: 400 });
  }

  const { error: statusError } = await db
    .from("email_connections")
    .update({ sync_status: "syncing", error_message: null })
    .eq("id", connection.id);

  if (statusError) {
    console.error("[gmail/sync] status update failed:", statusError.message);
    return NextResponse.json({ error: "Unable to start Gmail sync." }, { status: 500 });
  }

  try {
    const result = await importRecentGmailInbox({
      db,
      connection: connection as EmailConnection,
      maxResults: 10,
    });
    await markGmailSyncSuccess({ db, connectionId: connection.id, result });
    return NextResponse.json({ ok: true, imported: result.imported ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail sync failed.";
    await markGmailSyncError({ db, connectionId: connection.id, message });
    console.error("[gmail/sync] sync error:", message);
    return NextResponse.json({ error: "Gmail sync failed. Please try again." }, { status: 500 });
  }
}
