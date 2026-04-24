import { NextRequest, NextResponse } from "next/server";
import { fetchInboundForConnection, type MailboxConnectionRecord } from "@/lib/email/adapters";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const CONNECTION_SELECT =
  "id, org_id, provider, connection_type, provider_account_email, display_name, status, sync_status, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes, last_history_id, watch_expires_at, last_sync_at, inbound_enabled, outbound_enabled, last_validated_at, last_inbound_sync_at, last_outbound_send_at, last_error_code, last_error_message, error_message, diagnostics_json, credential_metadata, provider_metadata";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return unauthorized();
  }

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    console.error("[mailbox/poll] admin client init failed:", error);
    return NextResponse.json({ error: "Mailbox polling is unavailable." }, { status: 503 });
  }

  const { data, error } = await db
    .from("email_connections")
    .select(CONNECTION_SELECT)
    .eq("provider", "gmail")
    .eq("connection_type", "oauth")
    .eq("inbound_enabled", true)
    .in("status", ["active", "connected"])
    .order("last_inbound_sync_at", { ascending: true, nullsFirst: true })
    .limit(10);

  if (error) {
    console.error("[mailbox/poll] connection lookup failed:", error.message);
    return NextResponse.json({ error: "Mailbox polling failed." }, { status: 500 });
  }

  const results = [];
  for (const connection of (data ?? []) as MailboxConnectionRecord[]) {
    try {
      const result = await fetchInboundForConnection({ db }, connection, { maxMessages: 25 });
      results.push({ connectionId: connection.id, email: connection.provider_account_email, ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mailbox polling failed.";
      results.push({ connectionId: connection.id, email: connection.provider_account_email, ok: false, error: message });
    }
  }

  return NextResponse.json({
    ok: results.every((result) => result.ok),
    scannedConnections: data?.length ?? 0,
    results,
  });
}

