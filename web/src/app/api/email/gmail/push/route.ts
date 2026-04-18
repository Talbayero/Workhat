import { NextRequest, NextResponse } from "next/server";
import {
  importGmailHistory,
  importRecentGmailInbox,
  markGmailSyncError,
  markGmailSyncSuccess,
  type EmailConnection,
} from "@/lib/email-connector/gmail-importer";
import { createAdminClient } from "@/lib/supabase/admin";

type PubSubPushPayload = {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
};

type GmailPushData = {
  emailAddress?: string;
  historyId?: string;
};

function decodePubSubData(data: string | undefined) {
  if (!data) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as GmailPushData;
  } catch {
    return null;
  }
}

function isExpiredHistoryCursor(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("gmail history sync failed") &&
    (message.includes("404") || message.includes("historyid") || message.includes("history id"))
  );
}

export async function POST(req: NextRequest) {
  const expectedToken = process.env.GMAIL_PUSH_TOKEN;
  if (expectedToken && req.nextUrl.searchParams.get("token") !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: PubSubPushPayload;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid Pub/Sub payload" }, { status: 400 });
    }
    payload = parsed as PubSubPushPayload;
  } catch {
    return NextResponse.json({ error: "Invalid Pub/Sub payload" }, { status: 400 });
  }

  if (payload.message && typeof payload.message !== "object") {
    return NextResponse.json({ error: "Invalid Pub/Sub message" }, { status: 400 });
  }

  const messageData = typeof payload.message?.data === "string" ? payload.message.data : undefined;
  const data = decodePubSubData(messageData);
  const emailAddress = data?.emailAddress?.toLowerCase();
  const historyId = data?.historyId;

  if (!emailAddress || !historyId) {
    return NextResponse.json({ ok: true, skipped: "missing_gmail_notification_data" });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[gmail/push] admin client init failed:", message);
    return NextResponse.json({ error: "Gmail push import is unavailable." }, { status: 503 });
  }

  const { data: connection, error: connectionError } = await supabase
    .from("email_connections")
    .select("id, org_id, provider_account_email, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, last_history_id, provider_metadata")
    .eq("provider", "gmail")
    .eq("provider_account_email", emailAddress)
    .in("status", ["connected", "error"])
    .limit(1)
    .maybeSingle();

  if (connectionError) {
    return NextResponse.json({ error: connectionError.message }, { status: 500 });
  }

  if (!connection) {
    return NextResponse.json({ ok: true, skipped: "unknown_mailbox" });
  }

  const metadata = (connection as { provider_metadata?: Record<string, unknown> }).provider_metadata ?? {};
  const { error: markSyncingError } = await supabase
    .from("email_connections")
    .update({
      sync_status: "syncing",
      status: "connected",
      error_message: null,
      provider_metadata: {
        ...metadata,
        gmail_pending_history: {
          history_id: historyId,
          received_at: new Date().toISOString(),
          pubsub_message_id: payload.message?.messageId ?? null,
          subscription: payload.subscription ?? null,
        },
      },
    })
    .eq("id", (connection as { id: string }).id);

  if (markSyncingError) {
    return NextResponse.json({ error: markSyncingError.message }, { status: 500 });
  }

  try {
    const typedConnection = connection as EmailConnection;
    let recoveredFromExpiredCursor = false;
    let result;

    if (typedConnection.last_history_id) {
      try {
        result = await importGmailHistory({
          db: supabase,
          connection: typedConnection,
          startHistoryId: typedConnection.last_history_id,
        });
      } catch (error) {
        if (!isExpiredHistoryCursor(error)) throw error;

        recoveredFromExpiredCursor = true;
        const fallbackResult = await importRecentGmailInbox({
          db: supabase,
          connection: typedConnection,
          maxResults: 20,
        });
        result = {
          ...fallbackResult,
          latestHistoryId: fallbackResult.latestHistoryId ?? historyId,
        };
      }
    } else {
      result = await importRecentGmailInbox({
        db: supabase,
        connection: typedConnection,
        maxResults: 10,
      });
    }

    await markGmailSyncSuccess({
      db: supabase,
      connectionId: typedConnection.id,
      result,
    });

    return NextResponse.json({ ok: true, historyId, recoveredFromExpiredCursor, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail history sync failed.";
    await markGmailSyncError({
      db: supabase,
      connectionId: (connection as { id: string }).id,
      message,
    });

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
