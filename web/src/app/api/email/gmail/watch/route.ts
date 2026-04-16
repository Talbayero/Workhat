import { NextResponse } from "next/server";
import { decryptSecret, encryptSecret } from "@/lib/email-connector/encryption";
import {
  refreshGmailAccessToken,
  tokenExpiryDate,
  watchGmailInbox,
} from "@/lib/email-connector/google";
import { createClient } from "@/lib/supabase/server";

type AppUser = {
  id: string;
  org_id: string;
  role: string;
};

type EmailConnection = {
  id: string;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  provider_metadata: Record<string, unknown>;
};

async function getAppUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .single();

  return data as AppUser | null;
}

async function getFreshAccessToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  connection: EmailConnection
) {
  if (!connection.refresh_token_ciphertext) {
    throw new Error("Gmail connection is missing a refresh token. Reconnect Gmail.");
  }

  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  const hasUsableAccessToken =
    connection.access_token_ciphertext && expiresAt > Date.now() + 60_000;

  if (hasUsableAccessToken) {
    return decryptSecret(connection.access_token_ciphertext!);
  }

  const refreshed = await refreshGmailAccessToken(decryptSecret(connection.refresh_token_ciphertext));
  const encryptedAccessToken = encryptSecret(refreshed.access_token);
  await supabase
    .from("email_connections")
    .update({
      access_token_ciphertext: encryptedAccessToken,
      token_expires_at: tokenExpiryDate(refreshed.expires_in).toISOString(),
      scopes: refreshed.scope?.split(" ") ?? [],
      status: "connected",
      error_message: null,
    })
    .eq("id", connection.id);

  return refreshed.access_token;
}

export async function POST() {
  const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
  if (!topicName) {
    return NextResponse.json({
      error: "GOOGLE_PUBSUB_TOPIC is required before Gmail live watch can be enabled.",
    }, { status: 500 });
  }

  const supabase = await createClient();
  const appUser = await getAppUser(supabase);
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "manager"].includes(appUser.role)) {
    return NextResponse.json({ error: "Only admins and managers can enable Gmail watch." }, { status: 403 });
  }

  const { data: connection, error } = await supabase
    .from("email_connections")
    .select("id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, provider_metadata")
    .eq("org_id", appUser.org_id)
    .eq("provider", "gmail")
    .eq("status", "connected")
    .limit(1)
    .single();

  if (error || !connection) {
    return NextResponse.json({ error: "Connect Gmail before enabling live watch." }, { status: 400 });
  }

  try {
    const accessToken = await getFreshAccessToken(supabase, connection as EmailConnection);
    const watch = await watchGmailInbox({ accessToken, topicName });
    const expiration = new Date(Number(watch.expiration)).toISOString();

    await supabase
      .from("email_connections")
      .update({
        sync_status: "watching",
        watch_expires_at: expiration,
        last_history_id: watch.historyId,
        error_message: null,
        provider_metadata: {
          ...((connection as EmailConnection).provider_metadata ?? {}),
          gmail_watch: {
            topic_name: topicName,
            registered_at: new Date().toISOString(),
            expiration,
          },
        },
      })
      .eq("id", (connection as EmailConnection).id);

    return NextResponse.json({ ok: true, historyId: watch.historyId, expiration });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enable Gmail watch.";
    await supabase
      .from("email_connections")
      .update({ sync_status: "error", error_message: message })
      .eq("id", (connection as EmailConnection).id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
