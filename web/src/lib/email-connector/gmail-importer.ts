import { decryptSecret, encryptSecret } from "@/lib/email-connector/encryption";
import {
  fetchGmailMessage,
  listGmailHistory,
  listGmailInboxMessages,
  refreshGmailAccessToken,
  tokenExpiryDate,
  type GmailMessage,
} from "@/lib/email-connector/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { processInboundEmail, type InboundChannel, type NormalizedInboundEmail } from "@/lib/email-connector/inbound";

type SupabaseDb = ReturnType<typeof createAdminClient>;

export type EmailConnection = {
  id: string;
  org_id: string;
  provider_account_email: string;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  last_history_id: string | null;
};

export type GmailImportResult = {
  imported: number;
  skipped: number;
  scanned: number;
  latestHistoryId: string | null;
  mode: "full" | "history";
};

function getHeader(message: GmailMessage, name: string) {
  const headers = message.payload?.headers ?? [];
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBase64Url(data: string) {
  return Buffer.from(data, "base64url").toString("utf8");
}

function extractBodies(payload: GmailMessage["payload"]): { text: string; html: string | null } {
  if (!payload) return { text: "", html: null };

  const bodyData = payload.body?.data ? decodeBase64Url(payload.body.data) : "";
  if (payload.mimeType === "text/plain" && bodyData) return { text: bodyData, html: null };
  if (payload.mimeType === "text/html" && bodyData) return { text: "", html: bodyData };

  let text = "";
  let html: string | null = null;
  for (const part of payload.parts ?? []) {
    const nested = extractBodies(part);
    if (!text && nested.text) text = nested.text;
    if (!html && nested.html) html = nested.html;
  }

  return { text, html };
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuotedReply(text: string) {
  const lines = text.split("\n");
  const cutoff = lines.findIndex((line) => {
    const trimmed = line.trim();
    return /^On .* wrote:/.test(trimmed) || trimmed.startsWith(">") || /^-{3,}/.test(trimmed);
  });
  return (cutoff > 0 ? lines.slice(0, cutoff) : lines).join("\n").trim();
}

function parseEmailAddress(value: string) {
  const match = value.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  if (match) {
    const name = match[1]?.trim() || match[2].split("@")[0];
    return { name, email: match[2].trim().toLowerCase() };
  }

  const email = value.trim().toLowerCase();
  return { name: email.split("@")[0], email };
}

export async function getFreshGmailAccessToken(db: SupabaseDb, connection: EmailConnection) {
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
  const { error: updateError } = await db
    .from("email_connections")
    .update({
      access_token_ciphertext: encryptedAccessToken,
      token_expires_at: tokenExpiryDate(refreshed.expires_in).toISOString(),
      scopes: refreshed.scope?.split(" ") ?? [],
      status: "connected",
      error_message: null,
    })
    .eq("id", connection.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return refreshed.access_token;
}

async function importMessage({
  db,
  accessToken,
  channel,
  messageId,
}: {
  db: SupabaseDb;
  accessToken: string;
  channel: InboundChannel;
  messageId: string;
}) {
  const message = await fetchGmailMessage(accessToken, messageId);
  const from = parseEmailAddress(getHeader(message, "From"));
  const to = parseEmailAddress(getHeader(message, "To") || channel.inbound_address || "inbound@workhat.local");
  const subject = (getHeader(message, "Subject") || "(no subject)").slice(0, 500);
  const rfcMessageId = (getHeader(message, "Message-ID") || null)?.slice(0, 500) ?? null;
  const inReplyTo = (getHeader(message, "In-Reply-To") || null)?.slice(0, 500) ?? null;
  const references = getHeader(message, "References").split(/\s+/).filter(Boolean).slice(0, 20);
  const { text, html } = extractBodies(message.payload);
  const bodyText = stripQuotedReply(text || (html ? stripHtml(html) : message.snippet ?? "")).slice(0, 100_000);
  const messageCreatedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : new Date().toISOString();

  const normalized: NormalizedInboundEmail = {
    provider: "gmail",
    externalMessageId: message.id,
    externalThreadId: message.threadId ?? null,
    inReplyTo,
    references,
    headers: {
      "message-id": rfcMessageId ?? "",
      "in-reply-to": inReplyTo ?? "",
      references: references.join(" "),
    },
    from: {
      email: from.email.slice(0, 254),
      name: from.name.slice(0, 100),
    },
    to: [{ email: to.email.slice(0, 254), name: to.name.slice(0, 100) }],
    cc: [],
    subject,
    textBody: bodyText,
    htmlBody: html,
    receivedAt: messageCreatedAt,
    metadata: {
      gmail_history_id: message.historyId ?? null,
      rfc_message_id: rfcMessageId,
      label_ids: message.labelIds ?? [],
    },
  };

  const result = await processInboundEmail({
    db,
    channel,
    message: normalized,
    source: "gmail.importer",
  });

  return { imported: !result.duplicate, historyId: message.historyId ?? null };
}

async function getChannel(db: SupabaseDb, orgId: string): Promise<InboundChannel> {
  const { data: gmailChannel, error: gmailChannelError } = await db
    .from("channels")
    .select("id, org_id, provider, status, inbound_address, config_json")
    .eq("org_id", orgId)
    .eq("type", "email")
    .eq("provider", "gmail")
    .limit(1)
    .maybeSingle();

  if (gmailChannelError) throw new Error(gmailChannelError.message);
  if (gmailChannel) return gmailChannel as InboundChannel;

  const { data: channel, error } = await db
    .from("channels")
    .select("id, org_id, provider, status, inbound_address, config_json")
    .eq("org_id", orgId)
    .eq("type", "email")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!channel) throw new Error("No email channel found for this workspace.");
  return channel as InboundChannel;
}

export async function importRecentGmailInbox({
  db,
  connection,
  maxResults = 10,
}: {
  db: SupabaseDb;
  connection: EmailConnection;
  maxResults?: number;
}): Promise<GmailImportResult> {
  const accessToken = await getFreshGmailAccessToken(db, connection);
  const channel = await getChannel(db, connection.org_id);
  const list = await listGmailInboxMessages({ accessToken, maxResults });
  let imported = 0;
  let skipped = 0;
  let latestHistoryId: string | null = null;

  for (const item of list.messages ?? []) {
    const result = await importMessage({
      db,
      accessToken,
      channel,
      messageId: item.id,
    });
    latestHistoryId = result.historyId ?? latestHistoryId;
    if (result.imported) imported += 1;
    else skipped += 1;
  }

  return {
    imported,
    skipped,
    scanned: list.messages?.length ?? 0,
    latestHistoryId,
    mode: "full",
  };
}

export async function importGmailHistory({
  db,
  connection,
  startHistoryId,
  maxPages = 3,
}: {
  db: SupabaseDb;
  connection: EmailConnection;
  startHistoryId: string;
  maxPages?: number;
}): Promise<GmailImportResult> {
  const accessToken = await getFreshGmailAccessToken(db, connection);
  const channel = await getChannel(db, connection.org_id);
  let imported = 0;
  let skipped = 0;
  let scanned = 0;
  let latestHistoryId: string | null = null;
  let pageToken: string | undefined;
  const seen = new Set<string>();

  for (let page = 0; page < maxPages; page += 1) {
    const history = await listGmailHistory({ accessToken, startHistoryId, pageToken });
    latestHistoryId = history.historyId ?? latestHistoryId;

    for (const record of history.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        const messageId = added.message?.id;
        if (!messageId || seen.has(messageId)) continue;
        seen.add(messageId);
        scanned += 1;

        const result = await importMessage({
          db,
          accessToken,
          channel,
          messageId,
        });
        latestHistoryId = result.historyId ?? latestHistoryId;
        if (result.imported) imported += 1;
        else skipped += 1;
      }
    }

    pageToken = history.nextPageToken;
    if (!pageToken) break;
  }

  return { imported, skipped, scanned, latestHistoryId, mode: "history" };
}

export async function markGmailSyncSuccess({
  db,
  connectionId,
  result,
}: {
  db: SupabaseDb;
  connectionId: string;
  result: GmailImportResult;
}) {
  const updates: Record<string, string | null> = {
    sync_status: "idle",
    status: "connected",
    last_sync_at: new Date().toISOString(),
    error_message: null,
  };

  if (result.latestHistoryId) {
    updates.last_history_id = result.latestHistoryId;
  }

  const { error } = await db
    .from("email_connections")
    .update(updates)
    .eq("id", connectionId);

  if (error) throw new Error(error.message);
}

export async function markGmailSyncError({
  db,
  connectionId,
  message,
}: {
  db: SupabaseDb;
  connectionId: string;
  message: string;
}) {
  const { error } = await db
    .from("email_connections")
    .update({ sync_status: "error", status: "error", error_message: message })
    .eq("id", connectionId);

  if (error) throw new Error(error.message);
}
