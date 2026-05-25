import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  importRecentGmailInbox,
  markGmailSyncError,
  markGmailSyncSuccess,
  type EmailConnection,
} from "@/lib/email/gmail-importer";
import { GMAIL_IMPORT_QUERY } from "@/lib/email/google";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractContextFromRequest } from "@/lib/request-context";

function mapGmailSyncFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "Gmail sync failed.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("refresh") ||
    normalized.includes("invalid_grant") ||
    normalized.includes("missing a refresh token")
  ) {
    return {
      status: 401,
      code: "gmail_token_refresh_failed",
      error: "Gmail connection needs to be reconnected before importing mail.",
      hint: "Reconnect Gmail in Settings -> Channels, then import latest email again.",
    };
  }

  return {
    status: 502,
    code: "gmail_sync_failed",
    error: "Gmail import failed. Please try again.",
    hint: "If this continues, reconnect Gmail in Settings -> Channels.",
  };
}

export async function POST(req: NextRequest) {
  const requestId = extractContextFromRequest(req).requestId;
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
    .select("id, org_id, provider_account_email, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, last_history_id, provider_metadata")
    .eq("org_id", appUser.org_id)
    .eq("provider", "gmail")
    .eq("connection_type", "oauth")
    .in("status", ["active", "connected"])
    .limit(1)
    .maybeSingle();

  if (connectionError || !connection) {
    return NextResponse.json({
      error: "No active Gmail OAuth connection is available. Connect Gmail in Settings -> Channels, then import latest email.",
      code: "gmail_connection_missing",
      requestId,
    }, { status: 400 });
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
    console.info("[gmail/sync] import started:", {
      requestId,
      orgId: appUser.org_id,
      connectionId: connection.id,
      mailbox: connection.provider_account_email,
      query: GMAIL_IMPORT_QUERY,
    });
    const result = await importRecentGmailInbox({
      db,
      connection: connection as EmailConnection,
      maxResults: 25,
      requestId,
    });
    await markGmailSyncSuccess({
      db,
      connectionId: connection.id,
      result,
      existingProviderMetadata: (connection as EmailConnection).provider_metadata ?? null,
    });
    console.info("[gmail/sync] import completed:", {
      requestId,
      orgId: appUser.org_id,
      connectionId: connection.id,
      mailbox: connection.provider_account_email,
      query: GMAIL_IMPORT_QUERY,
      scanned: result.scanned,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors ?? 0,
      skipReasons: result.skipReasons ?? {},
      errorReasons: result.errorReasons ?? {},
    });
    return NextResponse.json({
      ok: true,
      requestId,
      imported: result.imported,
      skipped: result.skipped,
      scanned: result.scanned,
      errors: result.errors ?? 0,
      skipReasons: result.skipReasons ?? {},
      errorReasons: result.errorReasons ?? {},
      latestHistoryId: result.latestHistoryId,
      mode: result.mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail sync failed.";
    await markGmailSyncError({ db, connectionId: connection.id, message });
    const failure = mapGmailSyncFailure(error);
    console.error("[gmail/sync] sync error:", {
      requestId,
      orgId: appUser.org_id,
      connectionId: connection.id,
      mailbox: connection.provider_account_email,
      message,
      code: failure.code,
    });
    return NextResponse.json({ ...failure, requestId }, { status: failure.status });
  }
}

