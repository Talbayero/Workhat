import { NextRequest, NextResponse } from "next/server";
import {
  getFreshGmailAccessToken,
  type EmailConnection,
} from "@/lib/email-connector/gmail-importer";
import { watchGmailInbox } from "@/lib/email-connector/google";
import { createAdminClient } from "@/lib/supabase/admin";

type WatchConnection = EmailConnection & {
  provider_metadata: Record<string, unknown> | null;
  watch_expires_at: string | null;
};

type RenewalResult = {
  connectionId: string;
  email: string;
  ok: boolean;
  expiration?: string;
  error?: string;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function shouldRenew(expiresAt: string | null) {
  if (!expiresAt) return true;
  const renewalWindowMs = 48 * 60 * 60 * 1000;
  return new Date(expiresAt).getTime() <= Date.now() + renewalWindowMs;
}

async function renewConnection({
  connection,
  topicName,
}: {
  connection: WatchConnection;
  topicName: string;
}): Promise<RenewalResult> {
  const db = createAdminClient();

  try {
    const accessToken = await getFreshGmailAccessToken(db, connection);
    const watch = await watchGmailInbox({ accessToken, topicName });
    const expiration = new Date(Number(watch.expiration)).toISOString();
    const metadata = connection.provider_metadata ?? {};

    await db
      .from("email_connections")
      .update({
        sync_status: "watching",
        status: "connected",
        watch_expires_at: expiration,
        last_history_id: watch.historyId,
        error_message: null,
        provider_metadata: {
          ...metadata,
          gmail_watch: {
            topic_name: topicName,
            registered_at: new Date().toISOString(),
            expiration,
            renewed_by: "cron",
          },
        },
      })
      .eq("id", connection.id);

    return {
      connectionId: connection.id,
      email: connection.provider_account_email,
      ok: true,
      expiration,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to renew Gmail watch.";
    await db
      .from("email_connections")
      .update({
        sync_status: "error",
        status: "error",
        error_message: message,
      })
      .eq("id", connection.id);

    return {
      connectionId: connection.id,
      email: connection.provider_account_email,
      ok: false,
      error: message,
    };
  }
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return unauthorized();
  }

  const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
  if (!topicName) {
    return NextResponse.json({
      error: "GOOGLE_PUBSUB_TOPIC is required before Gmail watches can be renewed.",
    }, { status: 500 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("email_connections")
    .select("id, org_id, provider_account_email, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, last_history_id, watch_expires_at, provider_metadata")
    .eq("provider", "gmail")
    .in("status", ["connected", "error"])
    .limit(25);

  if (error) {
    console.error("[gmail/renew-watches] connection lookup failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = ((data ?? []) as WatchConnection[]).filter((connection) =>
    shouldRenew(connection.watch_expires_at)
  );
  const skipped = (data?.length ?? 0) - due.length;
  const results = await Promise.all(
    due.map((connection) => renewConnection({ connection, topicName }))
  );
  const failed = results.filter((result) => !result.ok);

  if (failed.length > 0) {
    console.error("[gmail/renew-watches] renewal failures:", failed);
  }

  return NextResponse.json({
    ok: failed.length === 0,
    scanned: data?.length ?? 0,
    renewed: results.filter((result) => result.ok).length,
    failed: failed.length,
    skipped,
    results,
  });
}
