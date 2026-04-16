import { randomUUID } from "crypto";
import { sendGmailMessage } from "@/lib/email-connector/google";
import {
  getFreshGmailAccessToken,
  type EmailConnection,
} from "@/lib/email-connector/gmail-importer";
import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseDb = ReturnType<typeof createAdminClient>;

type GmailThreadContext = {
  threadId: string | null;
  messageId: string | null;
};

export type GmailOutboundResult = {
  provider: "gmail";
  providerMessageId: string;
  providerThreadId: string;
  rfcMessageId: string;
  sentFrom: string;
};

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function encodeHeader(value: string) {
  return /[^\x00-\x7F]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value;
}

function normalizeSubject(subject: string) {
  const clean = subject.trim() || "(no subject)";
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

function buildRawReply({
  from,
  to,
  subject,
  body,
  inReplyTo,
}: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
}) {
  const rfcMessageId = `<workhat-${randomUUID()}@work-hat.com>`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(normalizeSubject(subject))}`,
    `Message-ID: ${rfcMessageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
  ];

  return {
    raw: base64Url(`${headers.join("\r\n")}\r\n\r\n${body}`),
    rfcMessageId,
  };
}

function asMessageId(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
}

async function getGmailConnection(db: SupabaseDb, orgId: string) {
  const { data, error } = await db
    .from("email_connections")
    .select("id, org_id, provider_account_email, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, last_history_id")
    .eq("org_id", orgId)
    .eq("provider", "gmail")
    .eq("status", "connected")
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as EmailConnection;
}

async function getGmailThreadContext(db: SupabaseDb, orgId: string, conversationId: string) {
  const { data } = await db
    .from("messages")
    .select("metadata_json")
    .eq("org_id", orgId)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return { threadId: null, messageId: null } satisfies GmailThreadContext;

  const metadata = (data as { metadata_json?: Record<string, unknown> }).metadata_json ?? {};
  const rfcMessageId =
    typeof metadata.rfc_message_id === "string" ? metadata.rfc_message_id : null;

  return {
    threadId: typeof metadata.gmail_thread_id === "string" ? metadata.gmail_thread_id : null,
    messageId: asMessageId(rfcMessageId),
  } satisfies GmailThreadContext;
}

export async function sendConversationReplyWithGmail({
  db,
  orgId,
  conversationId,
  body,
}: {
  db: SupabaseDb;
  orgId: string;
  conversationId: string;
  body: string;
}): Promise<GmailOutboundResult | null> {
  const connection = await getGmailConnection(db, orgId);
  if (!connection) return null;

  const { data: conversation, error: conversationError } = await db
    .from("conversations")
    .select("id, subject, contacts(email)")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .single();

  if (conversationError || !conversation) {
    throw new Error("Conversation not found.");
  }

  const contact = (conversation as { contacts?: { email?: string | null } | { email?: string | null }[] | null }).contacts;
  const contactEmail = Array.isArray(contact) ? contact[0]?.email : contact?.email;
  if (!contactEmail) {
    throw new Error("This conversation has no customer email to reply to.");
  }

  const accessToken = await getFreshGmailAccessToken(db, connection);
  const thread = await getGmailThreadContext(db, orgId, conversationId);
  const reply = buildRawReply({
    from: connection.provider_account_email,
    to: contactEmail,
    subject: (conversation as { subject?: string | null }).subject ?? "(no subject)",
    body,
    inReplyTo: thread.messageId,
  });
  const sent = await sendGmailMessage({
    accessToken,
    threadId: thread.threadId,
    raw: reply.raw,
  });

  return {
    provider: "gmail",
    providerMessageId: sent.id,
    providerThreadId: sent.threadId,
    rfcMessageId: reply.rfcMessageId,
    sentFrom: connection.provider_account_email,
  };
}
