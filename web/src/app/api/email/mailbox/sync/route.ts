import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { fetchInboundForConnection, type MailboxConnectionRecord } from "@/lib/email/adapters";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const CONNECTION_SELECT =
  "id, org_id, provider, connection_type, provider_account_email, display_name, status, sync_status, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes, last_history_id, watch_expires_at, last_sync_at, inbound_enabled, outbound_enabled, last_validated_at, last_inbound_sync_at, last_outbound_send_at, last_error_code, last_error_message, error_message, diagnostics_json, credential_metadata, provider_metadata";

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "mailbox/sync" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireCapability(appUser, "integrations.manage", "mailbox/sync");
  if (denied) return denied;

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    console.error("[mailbox/sync] admin client init failed:", error);
    return NextResponse.json({ error: "Mailbox sync is unavailable." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({})) as { connectionId?: string; maxMessages?: number };
  let query = db
    .from("email_connections")
    .select(CONNECTION_SELECT)
    .eq("org_id", appUser.org_id)
    .eq("provider", "gmail")
    .eq("connection_type", "oauth")
    .eq("inbound_enabled", true)
    .in("status", ["active", "connected"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (body.connectionId) query = query.eq("id", body.connectionId);

  const { data: connection, error } = await query.maybeSingle();
  if (error) {
    console.error("[mailbox/sync] connection lookup failed:", error.message);
    return NextResponse.json({ error: "Unable to find an active mailbox connection." }, { status: 500 });
  }

  if (!connection) {
    return NextResponse.json(
      { error: "No active Gmail OAuth mailbox is available. Connect Gmail before importing mail." },
      { status: 400 }
    );
  }

  try {
    const result = await fetchInboundForConnection(
      { db },
      connection as MailboxConnectionRecord,
      { maxMessages: body.maxMessages }
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox sync failed.";
    console.error("[mailbox/sync] sync failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

