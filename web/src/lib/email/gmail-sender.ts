import { randomUUID } from "crypto";
import { sendGmailMessage } from "@/lib/email/google";
import {
  getFreshGmailAccessToken,
  type EmailConnection,
} from "@/lib/email/gmail-importer";
import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseDb = ReturnType<typeof createAdminClient>;

type GmailThreadContext = {
  threadId: string | null;
  messageId: string | null;
};

export type GmailOutboundResult = {
  connectionId: string;
  provider: "gmail";
  providerMessageId: string;
  providerThreadId: string;
  rfcMessageId: string;
  sentFrom: string;
};

export type GmailOutboundErrorCode =
  | "gmail_connection_missing"
  | "gmail_token_refresh_failed"
  | "gmail_api_rejected"
  | "gmail_missing_recipient"
  | "conversation_not_found";

export class GmailOutboundError extends Error {
  code: GmailOutboundErrorCode;

  constructor(code: GmailOutboundErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GmailOutboundError";
    this.code = code;
  }
}

export function isGmailOutboundError(error: unknown): error is GmailOutboundError {
  return error instanceof GmailOutboundError;
}

type GmailSendConnection = EmailConnection & {
  provider?: string | null;
  connection_type?: string | null;
  status?: string | null;
  outbound_enabled?: boolean | null;
};

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

/**
 * Strip CR, LF, and NUL bytes from a header field value.
 * These characters can be used for email header injection (RFC 5322 §2.2).
 * We strip rather than reject so a weird subject line doesn't silently block
 * an outbound reply — the message still goes out, just with a cleaned subject.
 */
function stripHeaderInjectables(value: string) {
  return value.replace(/[\r\n\0]/g, "");
}

function encodeHeader(value: string) {
  const safe = stripHeaderInjectables(value);
  return /[^\x00-\x7F]/.test(safe)
    ? `=?UTF-8?B?${Buffer.from(safe, "utf8").toString("base64")}?=`
    : safe;
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
    `From: ${stripHeaderInjectables(from)}`,
    `To: ${stripHeaderInjectables(to)}`,
    `Subject: ${encodeHeader(normalizeSubject(subject))}`,
    `Message-ID: ${rfcMessageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    ...(inReplyTo ? [
      `In-Reply-To: ${stripHeaderInjectables(inReplyTo)}`,
      `References: ${stripHeaderInjectables(inReplyTo)}`,
    ] : []),
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
    .select("id, org_id, provider, connection_type, provider_account_email, status, outbound_enabled, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, last_history_id")
    .eq("org_id", orgId)
    .eq("provider", "gmail")
    .eq("connection_type", "oauth")
    .eq("outbound_enabled", true)
    .in("status", ["active", "connected"])
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as GmailSendConnection;
}

async function getGmailThreadContext(db: SupabaseDb, orgId: string, conversationId: string) {
  const { data, error } = await db
    .from("messages")
    .select("metadata_json")
    .eq("org_id", orgId)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
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
  connection,
  requestId,
}: {
  db: SupabaseDb;
  orgId: string;
  conversationId: string;
  body: string;
  connection?: GmailSendConnection;
  requestId?: string;
}): Promise<GmailOutboundResult | null> {
  const activeConnection = connection ?? await getGmailConnection(db, orgId);
  if (!activeConnection) return null;

  const { data: conversation, error: conversationError } = await db
    .from("conversations")
    .select("id, subject, contacts(email)")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (conversationError || !conversation) {
    throw new GmailOutboundError("conversation_not_found", "Conversation not found.");
  }

  const contact = (conversation as { contacts?: { email?: string | null } | { email?: string | null }[] | null }).contacts;
  const contactEmail = Array.isArray(contact) ? contact[0]?.email : contact?.email;
  if (!contactEmail) {
    throw new GmailOutboundError("gmail_missing_recipient", "This conversation has no customer email to reply to.");
  }

  let accessToken: string;
  try {
    accessToken = await getFreshGmailAccessToken(db, activeConnection);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail token refresh failed.";
    await db
      .from("email_connections")
      .update({
        status: "error",
        error_message: message,
        last_error_code: "token_refresh_failed",
        last_error_message: message,
      })
      .eq("id", activeConnection.id)
      .eq("org_id", orgId);
    console.warn("[gmail/send] token refresh failed:", {
      requestId,
      orgId,
      emailConnectionId: activeConnection.id,
      message,
    });
    throw new GmailOutboundError(
      "gmail_token_refresh_failed",
      "Gmail connection needs to be reconnected before sending.",
      { cause: error }
    );
  }

  const thread = await getGmailThreadContext(db, orgId, conversationId);
  const reply = buildRawReply({
    from: activeConnection.provider_account_email,
    to: contactEmail,
    subject: (conversation as { subject?: string | null }).subject ?? "(no subject)",
    body,
    inReplyTo: thread.messageId,
  });

  let sent: Awaited<ReturnType<typeof sendGmailMessage>>;
  try {
    sent = await sendGmailMessage({
      accessToken,
      threadId: thread.threadId,
      raw: reply.raw,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail rejected the send.";
    await db
      .from("email_connections")
      .update({
        last_error_code: "send_failed",
        last_error_message: message,
        error_message: message,
      })
      .eq("id", activeConnection.id)
      .eq("org_id", orgId);
    console.error("[gmail/send] Gmail API send failed:", {
      requestId,
      orgId,
      conversationId,
      emailConnectionId: activeConnection.id,
      message,
    });
    throw new GmailOutboundError(
      "gmail_api_rejected",
      "Gmail rejected the send. Check the connected mailbox and try again.",
      { cause: error }
    );
  }

  const { error: updateError } = await db
    .from("email_connections")
    .update({
      last_outbound_send_at: new Date().toISOString(),
      error_message: null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("id", activeConnection.id)
    .eq("org_id", orgId);

  if (updateError) {
    console.warn("[gmail/send] outbound timestamp update failed:", {
      requestId,
      orgId,
      conversationId,
      emailConnectionId: activeConnection.id,
      message: updateError.message,
    });
  }

  return {
    connectionId: activeConnection.id,
    provider: "gmail",
    providerMessageId: sent.id,
    providerThreadId: sent.threadId,
    rfcMessageId: reply.rfcMessageId,
    sentFrom: activeConnection.provider_account_email,
  };
}

