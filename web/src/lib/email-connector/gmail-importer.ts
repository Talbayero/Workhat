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

const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "live.com",
]);

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

function classifyIntent(subject: string, body: string) {
  const text = `${subject} ${body}`.toLowerCase();
  if (/invoice|payment|charge|refund|bill|subscription|cancel|pricing|receipt|overcharg/.test(text)) return "billing";
  if (/urgent|asap|critical|down|broken|error|bug|issue|problem|help|not working|crash|fail/.test(text)) return "support";
  if (/escalat|manager|unacceptable|terrible|worst|legal|lawsuit|complaint/.test(text)) return "escalation";
  if (/feature|suggest|would.*nice|can you add|request|idea|improvement/.test(text)) return "feature_request";
  if (/getting started|onboard|setup|how.*do|new user|tutorial|access|sign.?up/.test(text)) return "onboarding";
  return "general";
}

function scoreRisk(subject: string, body: string): "green" | "yellow" | "red" {
  const text = `${subject} ${body}`.toLowerCase();
  if (/urgent|legal|lawsuit|chargeback|fraud|cancel.*account|escalat|unacceptable|terrible|manager/.test(text)) return "red";
  if (/frustrated|not working|disappointed|broken|delay|overcharge|disappoint|slow|bad/.test(text)) return "yellow";
  return "green";
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
  await db
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

async function ensureContactAndCompany({
  db,
  orgId,
  fromName,
  fromEmail,
}: {
  db: SupabaseDb;
  orgId: string;
  fromName: string;
  fromEmail: string;
}) {
  const [firstName, ...restName] = fromName.split(" ");
  const { data: existingContact } = await db
    .from("contacts")
    .select("id, company_id")
    .eq("org_id", orgId)
    .eq("email", fromEmail)
    .single();

  let contactId = (existingContact as { id: string; company_id: string | null } | null)?.id ?? null;
  let companyId = (existingContact as { id: string; company_id: string | null } | null)?.company_id ?? null;

  if (contactId) {
    await db
      .from("contacts")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", contactId);
  } else {
    const { data: contact, error } = await db
      .from("contacts")
      .insert({
        org_id: orgId,
        first_name: firstName || fromName,
        last_name: restName.join(" "),
        full_name: fromName,
        email: fromEmail,
        status: "active",
        last_activity_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !contact) throw new Error(error?.message ?? "Failed to create contact.");
    contactId = contact.id;
  }

  const domain = fromEmail.split("@")[1] ?? "";
  if (domain && !GENERIC_DOMAINS.has(domain) && !companyId) {
    const { data: existingCompany } = await db
      .from("companies")
      .select("id")
      .eq("org_id", orgId)
      .eq("domain", domain)
      .single();

    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      const companyName = domain
        .split(".")[0]
        .replace(/-/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
      const { data: company } = await db
        .from("companies")
        .insert({
          org_id: orgId,
          name: companyName,
          domain,
          tier: "standard",
          open_conversations: 0,
          active_contacts: 0,
        })
        .select("id")
        .single();
      companyId = company?.id ?? null;
    }

    if (companyId && contactId) {
      await db
        .from("contacts")
        .update({ company_id: companyId })
        .eq("id", contactId)
        .is("company_id", null);
    }
  }

  return { contactId, companyId };
}

async function importMessage({
  db,
  accessToken,
  orgId,
  channelId,
  messageId,
}: {
  db: SupabaseDb;
  accessToken: string;
  orgId: string;
  channelId: string;
  messageId: string;
}) {
  const message = await fetchGmailMessage(accessToken, messageId);
  const channelMessageId = `gmail:${message.id}`;

  const { data: existingMessage } = await db
    .from("messages")
    .select("id")
    .eq("org_id", orgId)
    .eq("channel_message_id", channelMessageId)
    .single();

  if (existingMessage) {
    return { imported: false, historyId: message.historyId ?? null };
  }

  const from = parseEmailAddress(getHeader(message, "From"));
  const subject = getHeader(message, "Subject") || "(no subject)";
  const { text, html } = extractBodies(message.payload);
  const bodyText = stripQuotedReply(text || (html ? stripHtml(html) : message.snippet ?? ""));
  const preview = bodyText.replace(/\s+/g, " ").trim().slice(0, 160);
  const intent = classifyIntent(subject, bodyText);
  const riskLevel = scoreRisk(subject, bodyText);
  const { contactId, companyId } = await ensureContactAndCompany({
    db,
    orgId,
    fromName: from.name,
    fromEmail: from.email,
  });

  const externalThreadId = `gmail:${message.threadId}`;
  const messageCreatedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : new Date().toISOString();

  let conversationId: string | null = null;
  const { data: existingConversation } = await db
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("external_thread_id", externalThreadId)
    .single();

  if (existingConversation) {
    conversationId = existingConversation.id;
    await db
      .from("conversations")
      .update({
        preview,
        last_message_at: messageCreatedAt,
        ...(riskLevel === "red" ? { risk_level: "red" } : {}),
      })
      .eq("id", conversationId);
  } else {
    const { data: conversation, error: conversationError } = await db
      .from("conversations")
      .insert({
        org_id: orgId,
        contact_id: contactId,
        company_id: companyId,
        channel_id: channelId,
        subject,
        status: "open",
        priority: riskLevel === "red" ? "urgent" : "normal",
        risk_level: riskLevel,
        ai_confidence: "yellow",
        intent,
        preview,
        assigned_to_name: "",
        last_message_at: messageCreatedAt,
        external_thread_id: externalThreadId,
      })
      .select("id")
      .single();

    if (conversationError || !conversation) {
      throw new Error(conversationError?.message ?? "Failed to create conversation.");
    }
    conversationId = conversation.id;
  }

  const { error: messageError } = await db.from("messages").insert({
    org_id: orgId,
    conversation_id: conversationId,
    sender_type: "customer",
    direction: "inbound",
    channel_message_id: channelMessageId,
    author_name: from.name,
    subject,
    body_text: bodyText,
    body_html: html,
    is_note: false,
    metadata_json: {
      provider: "gmail",
      gmail_thread_id: message.threadId,
      gmail_history_id: message.historyId ?? null,
      from_email: from.email,
      label_ids: message.labelIds ?? [],
    },
    created_at: messageCreatedAt,
  });

  if (messageError) throw new Error(messageError.message);
  return { imported: true, historyId: message.historyId ?? null };
}

async function getChannelId(db: SupabaseDb, orgId: string) {
  const { data: channel } = await db
    .from("channels")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", "email")
    .single();

  if (!channel) throw new Error("No email channel found for this workspace.");
  return channel.id as string;
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
  const channelId = await getChannelId(db, connection.org_id);
  const list = await listGmailInboxMessages({ accessToken, maxResults });
  let imported = 0;
  let skipped = 0;
  let latestHistoryId: string | null = null;

  for (const item of list.messages ?? []) {
    const result = await importMessage({
      db,
      accessToken,
      orgId: connection.org_id,
      channelId,
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
  const channelId = await getChannelId(db, connection.org_id);
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
          orgId: connection.org_id,
          channelId,
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
  await db
    .from("email_connections")
    .update({
      sync_status: "idle",
      status: "connected",
      last_sync_at: new Date().toISOString(),
      last_history_id: result.latestHistoryId,
      error_message: null,
    })
    .eq("id", connectionId);
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
  await db
    .from("email_connections")
    .update({ sync_status: "error", status: "error", error_message: message })
    .eq("id", connectionId);
}
