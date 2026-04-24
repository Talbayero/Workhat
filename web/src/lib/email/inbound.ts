import { classifyIntent as classifyIntentFromDb, routeBySkill } from "@/ai/workflows/intent-classifier";
import { decryptSecret } from "@/lib/email/encryption";
import { verifyInboundWebhookSecretHash } from "@/lib/email/webhook-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshConversationSla } from "@/lib/sla/refresh";
import { emitWorkflowEvent } from "@/lib/workflow-engine";

type Db = ReturnType<typeof createAdminClient>;

export type InboundEmailAddress = {
  email: string;
  name?: string | null;
};

export type NormalizedInboundEmail = {
  provider: string;
  externalMessageId: string;
  externalThreadId: string | null;
  inReplyTo: string | null;
  references: string[];
  headers: Record<string, string>;
  from: InboundEmailAddress;
  to: InboundEmailAddress[];
  cc: InboundEmailAddress[];
  subject: string;
  textBody: string;
  htmlBody: string | null;
  receivedAt: string;
  metadata: Record<string, unknown>;
};

export type InboundChannel = {
  id: string;
  org_id: string;
  provider: string;
  status: string;
  inbound_address: string | null;
  config_json: Record<string, unknown>;
};

export type InboundProcessingResult = {
  ok: true;
  duplicate: boolean;
  skipped?: string;
  orgId?: string;
  channelId?: string;
  conversationId?: string;
  messageId?: string;
  contactId?: string | null;
  companyId?: string | null;
  intent?: string;
  riskLevel?: "green" | "yellow" | "red";
};

const MAX_SUBJECT_LENGTH = 500;
const MAX_BODY_LENGTH = 100_000;
const MAX_HTML_LENGTH = 150_000;
const MAX_MESSAGE_ID_LENGTH = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanProvider(value: string) {
  const provider = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 40);
  return provider || "custom_inbound";
}

function parseAddress(value: unknown): InboundEmailAddress | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = trimmed.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
    const email = (match?.[2] ?? trimmed).trim().toLowerCase().slice(0, 254);
    const name = (match?.[1]?.trim() || email.split("@")[0] || "").slice(0, 100);
    return EMAIL_RE.test(email) ? { email, name } : null;
  }

  const record = asRecord(value);
  if (!record) return null;
  const email = asString(record.email ?? record.Email).toLowerCase().slice(0, 254);
  const name = asString(record.name ?? record.Name).slice(0, 100);
  return EMAIL_RE.test(email) ? { email, name: name || email.split("@")[0] } : null;
}

function parseAddressList(value: unknown): InboundEmailAddress[] {
  if (Array.isArray(value)) {
    return value.map(parseAddress).filter((address): address is InboundEmailAddress => Boolean(address));
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map(parseAddress)
      .filter((address): address is InboundEmailAddress => Boolean(address));
  }
  const single = parseAddress(value);
  return single ? [single] : [];
}

function normalizeHeaders(value: unknown) {
  const headers: Record<string, string> = {};
  if (Array.isArray(value)) {
    for (const item of value) {
      const record = asRecord(item);
      const name = asString(record?.name ?? record?.Name);
      const headerValue = asString(record?.value ?? record?.Value);
      if (name && headerValue) headers[name.toLowerCase()] = headerValue.slice(0, 1000);
    }
  } else {
    const record = asRecord(value);
    for (const [key, headerValue] of Object.entries(record ?? {})) {
      if (typeof headerValue === "string") headers[key.toLowerCase()] = headerValue.slice(0, 1000);
    }
  }
  return headers;
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

function buildPreview(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

function classifyIntentFallback(subject: string, body: string) {
  const text = `${subject} ${body}`.toLowerCase();
  if (/invoice|payment|charge|refund|bill|subscription|cancel|pricing|receipt|overcharg/.test(text)) return "billing";
  if (/urgent|asap|critical|down|broken|error|bug|issue|problem|help|not working|crash|fail/.test(text)) return "support";
  if (/escalat|manager|unacceptable|terrible|worst|legal|lawsuit|complaint/.test(text)) return "escalation";
  if (/feature|suggest|would.*nice|can you add|request|idea|improvement/.test(text)) return "feature_request";
  if (/getting started|onboard|setup|how.*do|new user|tutorial|access|sign.?up/.test(text)) return "onboarding";
  return "unclassified";
}

function scoreRisk(subject: string, body: string): "green" | "yellow" | "red" {
  const text = `${subject} ${body}`.toLowerCase();
  if (/urgent|legal|lawsuit|chargeback|fraud|cancel.*account|escalat|unacceptable|terrible|manager/.test(text)) return "red";
  if (/frustrated|not working|disappointed|broken|delay|overcharge|disappoint|slow|bad/.test(text)) return "yellow";
  return "green";
}

function messageKey(provider: string, externalId: string) {
  return `${provider}:${externalId}`.slice(0, MAX_MESSAGE_ID_LENGTH);
}

export function normalizeInboundEmailPayload(raw: unknown): { ok: true; message: NormalizedInboundEmail } | { ok: false; error: string } {
  const body = asRecord(raw);
  if (!body) return { ok: false, error: "Payload must be a JSON object." };

  const headers = normalizeHeaders(body.headers ?? body.Headers);
  const provider = cleanProvider(asString(body.provider) || "custom_inbound");
  const externalMessageId = (
    asString(body.externalMessageId) ||
    asString(body.messageId) ||
    asString(body.MessageID) ||
    asString(headers["message-id"])
  ).slice(0, MAX_MESSAGE_ID_LENGTH);
  if (!externalMessageId) return { ok: false, error: "Message id is required." };

  const from = parseAddress(body.from ?? body.FromFull ?? body.From ?? {
    email: body.fromEmail,
    name: body.fromName,
  });
  if (!from) return { ok: false, error: "Valid sender email is required." };

  const to = parseAddressList(body.to ?? body.ToFull ?? body.To);
  if (to.length === 0) return { ok: false, error: "At least one recipient is required." };

  const html = asString(body.htmlBody ?? body.html ?? body.HtmlBody).slice(0, MAX_HTML_LENGTH);
  const rawText = asString(body.textBody ?? body.text ?? body.TextBody).slice(0, MAX_BODY_LENGTH);
  const textBody = stripQuotedReply(rawText || (html ? stripHtml(html) : "")).slice(0, MAX_BODY_LENGTH);
  if (!textBody && !html) return { ok: false, error: "Text or HTML body is required." };

  const receivedRaw = asString(body.receivedAt ?? body.received_at ?? body.Date);
  const receivedAt = Number.isNaN(Date.parse(receivedRaw)) ? new Date().toISOString() : new Date(receivedRaw).toISOString();
  const externalThreadId = (
    asString(body.externalThreadId) ||
    asString(body.threadId) ||
    asString(body.ThreadID) ||
    asString(body.InReplyTo)
  ).slice(0, MAX_MESSAGE_ID_LENGTH) || null;
  const inReplyTo = (asString(body.inReplyTo ?? body.InReplyTo) || asString(headers["in-reply-to"]))
    .slice(0, MAX_MESSAGE_ID_LENGTH) || null;

  return {
    ok: true,
    message: {
      provider,
      externalMessageId,
      externalThreadId,
      inReplyTo,
      references: asString(body.references ?? headers.references).split(/\s+/).filter(Boolean).slice(0, 20),
      headers,
      from,
      to,
      cc: parseAddressList(body.cc ?? body.CcFull ?? body.Cc),
      subject: (asString(body.subject ?? body.Subject) || "(no subject)").slice(0, MAX_SUBJECT_LENGTH),
      textBody,
      htmlBody: html || null,
      receivedAt,
      metadata: asRecord(body.metadata) ?? {},
    },
  };
}

export function extractInboundToken(headers: Headers) {
  const auth = headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return headers.get("x-workhat-inbound-token")?.trim() || headers.get("x-inbound-token")?.trim() || "";
}

export async function resolveInboundChannel({
  db,
  channelId,
  recipients,
}: {
  db: Db;
  channelId?: string | null;
  recipients: InboundEmailAddress[];
}): Promise<InboundChannel | null> {
  if (channelId) {
    const { data, error } = await db
      .from("channels")
      .select("id, org_id, provider, status, inbound_address, config_json")
      .eq("id", channelId)
      .eq("type", "email")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as InboundChannel | null;
  }

  const recipientEmails = recipients.map((recipient) => recipient.email.toLowerCase());
  if (recipientEmails.length === 0) return null;
  const { data, error } = await db
    .from("channels")
    .select("id, org_id, provider, status, inbound_address, config_json")
    .in("inbound_address", recipientEmails)
    .eq("type", "email")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as InboundChannel | null;
}

export function verifyInboundChannelToken(channel: InboundChannel, token: string) {
  const cfg = channel.config_json ?? {};
  const hashed = typeof cfg.webhook_secret_hash === "string" ? cfg.webhook_secret_hash : "";
  if (hashed) {
    return verifyInboundWebhookSecretHash(token, hashed);
  }

  const encrypted = typeof cfg.webhook_secret_ciphertext === "string" ? cfg.webhook_secret_ciphertext : "";
  if (encrypted) {
    return Boolean(token) && token === decryptSecret(encrypted);
  }

  // Compatibility with the pre-V2 Postmark route. New custom channels use
  // per-channel hashed webhook secrets instead of this environment-level token.
  const legacy = process.env.POSTMARK_INBOUND_TOKEN;
  return Boolean(legacy) && token === legacy;
}

async function ensureContactAndCompany({ db, orgId, from }: { db: Db; orgId: string; from: InboundEmailAddress }) {
  const senderName = (from.name?.trim() || from.email.split("@")[0]).slice(0, 100);
  const [firstName, ...restName] = senderName.split(" ");

  const { data: existingContact, error: contactLookupError } = await db
    .from("contacts")
    .select("id, company_id")
    .eq("org_id", orgId)
    .eq("email", from.email)
    .maybeSingle();
  if (contactLookupError) throw new Error(contactLookupError.message);

  let contactId = (existingContact as { id: string; company_id: string | null } | null)?.id ?? null;
  let companyId = (existingContact as { id: string; company_id: string | null } | null)?.company_id ?? null;

  if (contactId) {
    const { error } = await db
      .from("contacts")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", contactId)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await db
      .from("contacts")
      .insert({
        org_id: orgId,
        first_name: firstName || senderName,
        last_name: restName.join(" "),
        full_name: senderName,
        email: from.email,
        status: "active",
        last_activity_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to create contact.");
    contactId = data.id;
  }

  const domain = (from.email.split("@")[1] ?? "").slice(0, 255);
  if (domain && !GENERIC_DOMAINS.has(domain) && !companyId) {
    const { data: existingCompany, error: companyLookupError } = await db
      .from("companies")
      .select("id")
      .eq("org_id", orgId)
      .eq("domain", domain)
      .maybeSingle();
    if (companyLookupError) throw new Error(companyLookupError.message);

    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      const companyName = domain
        .split(".")[0]
        .replace(/-/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
        .slice(0, 200);
      const { data, error } = await db
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
      if (error || !data) throw new Error(error?.message ?? "Failed to create company.");
      companyId = data.id;
    }

    if (contactId && companyId) {
      const { error } = await db
        .from("contacts")
        .update({ company_id: companyId })
        .eq("id", contactId)
        .eq("org_id", orgId)
        .is("company_id", null);
      if (error) throw new Error(error.message);
    }
  }

  return { contactId, companyId };
}

async function classifyIntent(orgId: string, subject: string, body: string) {
  try {
    const intent = await classifyIntentFromDb(orgId, subject, body);
    if (intent && intent !== "unclassified") return intent;
  } catch {
    // Fall back below.
  }
  return classifyIntentFallback(subject, body);
}

async function routeConversation(db: Db, orgId: string, intent: string) {
  if (!intent || intent === "unclassified") return "";
  try {
    const { data } = await db
      .from("intents")
      .select("skill_required")
      .eq("org_id", orgId)
      .ilike("name", intent)
      .limit(1);
    const skillRequired = data?.[0]?.skill_required ?? null;
    if (!skillRequired) return "";
    const assignedUserId = await routeBySkill(orgId, skillRequired);
    if (!assignedUserId) return "";
    const { data: agent } = await db
      .from("users")
      .select("full_name")
      .eq("id", assignedUserId)
      .eq("org_id", orgId)
      .maybeSingle();
    return agent?.full_name ?? "";
  } catch {
    return "";
  }
}

async function findThreadConversation({
  db,
  orgId,
  provider,
  message,
}: {
  db: Db;
  orgId: string;
  provider: string;
  message: NormalizedInboundEmail;
}) {
  const externalThreadId = message.externalThreadId ? messageKey(provider, message.externalThreadId) : null;
  if (externalThreadId) {
    const { data, error } = await db
      .from("conversations")
      .select("id, risk_level")
      .eq("org_id", orgId)
      .eq("external_thread_id", externalThreadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as { id: string; risk_level: string | null };
  }

  const replyKeys = [message.inReplyTo, ...message.references]
    .filter(Boolean)
    .map((id) => messageKey(provider, id!));
  for (const key of replyKeys) {
    const { data, error } = await db
      .from("messages")
      .select("conversation_id")
      .eq("org_id", orgId)
      .eq("channel_message_id", key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.conversation_id) {
      const { data: conversation, error: conversationError } = await db
        .from("conversations")
        .select("id, risk_level")
        .eq("org_id", orgId)
        .eq("id", data.conversation_id)
        .maybeSingle();
      if (conversationError) throw new Error(conversationError.message);
      if (conversation) return conversation as { id: string; risk_level: string | null };
    }
  }

  return null;
}

async function updateInboundEvent(db: Db, eventId: string | null, updates: Record<string, unknown>) {
  if (!eventId) return;
  const { error } = await db.from("inbound_email_events").update(updates).eq("id", eventId);
  if (error) console.warn("[inbound] event update failed:", error.message);
}

async function findConversationById({
  db,
  orgId,
  conversationId,
}: {
  db: Db;
  orgId: string;
  conversationId: string | null | undefined;
}) {
  if (!conversationId) return null;
  const { data, error } = await db
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string } | null;
}

async function findMessageById({
  db,
  orgId,
  messageId,
}: {
  db: Db;
  orgId: string;
  messageId: string | null | undefined;
}) {
  if (!messageId) return null;
  const { data, error } = await db
    .from("messages")
    .select("id, conversation_id")
    .eq("org_id", orgId)
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; conversation_id: string } | null;
}

async function findExistingInboundEvent({
  db,
  orgId,
  provider,
  externalMessageId,
  dedupeKey,
}: {
  db: Db;
  orgId: string;
  provider: string;
  externalMessageId: string;
  dedupeKey: string;
}) {
  const { data: byDedupe, error: byDedupeError } = await db
    .from("inbound_email_events")
    .select("id, status, conversation_id, message_id")
    .eq("org_id", orgId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (byDedupeError) throw new Error(byDedupeError.message);
  if (byDedupe) return byDedupe as { id: string; status: string; conversation_id: string | null; message_id: string | null };

  const { data: byProviderMessage, error: byProviderMessageError } = await db
    .from("inbound_email_events")
    .select("id, status, conversation_id, message_id")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .eq("external_message_id", externalMessageId)
    .maybeSingle();
  if (byProviderMessageError) throw new Error(byProviderMessageError.message);
  return byProviderMessage as { id: string; status: string; conversation_id: string | null; message_id: string | null } | null;
}

export async function processInboundEmail({
  db,
  channel,
  message,
  source = "api.inbound.email",
}: {
  db: Db;
  channel: InboundChannel;
  message: NormalizedInboundEmail;
  source?: string;
}): Promise<InboundProcessingResult> {
  const orgId = channel.org_id;
  const provider = message.provider || channel.provider || "custom_inbound";
  const channelMessageId = messageKey(provider, message.externalMessageId);
  const dedupeKey = `${channel.id}:${channelMessageId}`;

  const { data: existingMessage, error: existingMessageError } = await db
    .from("messages")
    .select("id, conversation_id")
    .eq("org_id", orgId)
    .eq("channel_message_id", channelMessageId)
    .maybeSingle();
  if (existingMessageError) throw new Error(existingMessageError.message);
  if (existingMessage) {
    const existingConversation = await findConversationById({
      db,
      orgId,
      conversationId: existingMessage.conversation_id,
    });
    if (existingConversation) {
      return {
        ok: true,
        duplicate: true,
        orgId,
        channelId: channel.id,
        conversationId: existingMessage.conversation_id,
        messageId: existingMessage.id,
        skipped: "duplicate_message",
      };
    }

    console.warn("[inbound] duplicate message references a missing conversation; attempting event recovery", {
      orgId,
      channelId: channel.id,
      messageId: existingMessage.id,
      conversationId: existingMessage.conversation_id,
      channelMessageId,
    });
  }

  let eventId: string | null = null;
  const { data: event, error: eventError } = await db
    .from("inbound_email_events")
    .insert({
      org_id: orgId,
      channel_id: channel.id,
      provider,
      external_message_id: message.externalMessageId,
      external_thread_id: message.externalThreadId,
      dedupe_key: dedupeKey,
      status: "processing",
      received_at: message.receivedAt,
      payload_metadata: {
        from: message.from.email,
        to: message.to.map((recipient) => recipient.email),
        subject: message.subject,
      },
    })
    .select("id")
    .single();
  if (eventError?.code === "23505") {
    const existingEvent = await findExistingInboundEvent({
      db,
      orgId,
      provider,
      externalMessageId: message.externalMessageId,
      dedupeKey,
    });

    if (existingEvent?.message_id) {
      const existingMessage = await findMessageById({ db, orgId, messageId: existingEvent.message_id });
      const existingConversation = await findConversationById({
        db,
        orgId,
        conversationId: existingEvent.conversation_id ?? existingMessage?.conversation_id,
      });
      if (!existingMessage || !existingConversation) {
        eventId = existingEvent.id;
        await updateInboundEvent(db, eventId, {
          status: "processing",
          error_message: null,
          processed_at: null,
          received_at: message.receivedAt,
          message_id: null,
          conversation_id: null,
          payload_metadata: {
            from: message.from.email,
            to: message.to.map((recipient) => recipient.email),
            subject: message.subject,
            retry_reason: "recover_broken_duplicate_event",
          },
        });
      } else {
      return {
        ok: true,
        duplicate: true,
        orgId,
        channelId: channel.id,
        conversationId: existingConversation.id,
        messageId: existingMessage.id,
        skipped: "duplicate_event",
      };
      }
    }

    if (!existingEvent) {
      return { ok: true, duplicate: true, orgId, channelId: channel.id, skipped: "duplicate_event" };
    }

    if (!eventId) {
      eventId = existingEvent.id;
      await updateInboundEvent(db, eventId, {
        status: "processing",
        error_message: null,
        processed_at: null,
        received_at: message.receivedAt,
        payload_metadata: {
          from: message.from.email,
          to: message.to.map((recipient) => recipient.email),
          subject: message.subject,
          retry_reason: "recover_incomplete_event",
        },
      });
    }
  }
  if (eventError && eventError.code !== "23505") throw new Error(eventError.message ?? "Failed to record inbound event.");
  if (!event && !eventId) throw new Error("Failed to record inbound event.");
  eventId = eventId ?? event!.id;

  try {
    const { contactId, companyId } = await ensureContactAndCompany({ db, orgId, from: message.from });
    const intent = await classifyIntent(orgId, message.subject, message.textBody);
    const riskLevel = scoreRisk(message.subject, message.textBody);
    const assignedToName = await routeConversation(db, orgId, intent);
    const preview = buildPreview(message.textBody);
    const threadedConversation = await findThreadConversation({ db, orgId, provider, message });
    let conversationId = threadedConversation?.id ?? null;
    let createdConversation = false;
    const previousRiskLevel = threadedConversation?.risk_level ?? null;

    if (conversationId) {
      const { error } = await db
        .from("conversations")
        .update({
          preview,
          last_message_at: message.receivedAt,
          ...(riskLevel === "red" ? { risk_level: "red", priority: "urgent" } : {}),
        })
        .eq("id", conversationId)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    } else {
      const externalThreadId = messageKey(provider, message.externalThreadId || message.externalMessageId);
      const { data: conversation, error } = await db
        .from("conversations")
        .insert({
          org_id: orgId,
          contact_id: contactId,
          company_id: companyId,
          channel_id: channel.id,
          subject: message.subject,
          status: "open",
          priority: riskLevel === "red" ? "urgent" : "normal",
          risk_level: riskLevel,
          ai_confidence: "yellow",
          intent,
          preview,
          assigned_to_name: assignedToName,
          last_message_at: message.receivedAt,
          external_thread_id: externalThreadId,
        })
        .select("id")
        .single();
      if (error || !conversation) throw new Error(error?.message ?? "Failed to create conversation.");
      conversationId = conversation.id;
      createdConversation = true;
    }

    if (!conversationId) throw new Error("Conversation id missing after inbound thread resolution.");
    const finalConversationId = conversationId;

    const { data: insertedMessage, error: messageError } = await db
      .from("messages")
      .insert({
        org_id: orgId,
        conversation_id: finalConversationId,
        sender_type: "customer",
        direction: "inbound",
        channel_message_id: channelMessageId,
        author_name: (message.from.name || message.from.email.split("@")[0]).slice(0, 100),
        subject: message.subject,
        body_text: message.textBody,
        body_html: message.htmlBody,
        is_note: false,
        metadata_json: {
          provider,
          external_message_id: message.externalMessageId,
          external_thread_id: message.externalThreadId,
          in_reply_to: message.inReplyTo,
          references: message.references,
          headers: message.headers,
          from_email: message.from.email,
          recipients: message.to.map((recipient) => recipient.email),
          ...message.metadata,
        },
        created_at: message.receivedAt,
      })
      .select("id")
      .single();
    if (messageError?.code === "23505") {
      await updateInboundEvent(db, eventId, { status: "duplicate", processed_at: new Date().toISOString() });
      return { ok: true, duplicate: true, orgId, channelId: channel.id, conversationId: finalConversationId, skipped: "duplicate_insert" };
    }
    if (messageError || !insertedMessage) throw new Error(messageError?.message ?? "Failed to create message.");

    await refreshConversationSla({ db, orgId, conversationId: finalConversationId, source });

    if (createdConversation) {
      await emitWorkflowEvent({
        orgId,
        eventType: "conversation.created",
        aggregateType: "conversation",
        aggregateId: finalConversationId,
        conversationId: finalConversationId,
        source,
        payload: { subject: message.subject, intent, riskLevel, contactId, companyId, channelId: channel.id, provider },
      });
    } else {
      await emitWorkflowEvent({
        orgId,
        eventType: "conversation.updated",
        aggregateType: "conversation",
        aggregateId: finalConversationId,
        conversationId: finalConversationId,
        source,
        payload: { preview, previousRiskLevel, riskLevel, reason: "inbound_message", provider },
      });
    }

    await emitWorkflowEvent({
      orgId,
      eventType: "message.received",
      aggregateType: "message",
      aggregateId: insertedMessage.id,
      conversationId: finalConversationId,
      source,
      payload: { messageId: insertedMessage.id, subject: message.subject, preview, senderEmail: message.from.email, intent, riskLevel, channelId: channel.id, provider },
    });

    if (previousRiskLevel && previousRiskLevel !== riskLevel && riskLevel === "red") {
      await emitWorkflowEvent({
        orgId,
        eventType: "risk.changed",
        aggregateType: "conversation",
        aggregateId: finalConversationId,
        conversationId: finalConversationId,
        source,
        payload: { previousRiskLevel, riskLevel, reason: "inbound_message_escalation", provider },
      });
    }

    const processedAt = new Date().toISOString();
    await updateInboundEvent(db, eventId, {
      status: "processed",
      conversation_id: finalConversationId,
      message_id: insertedMessage.id,
      processed_at: processedAt,
    });

    await db
      .from("channels")
      .update({
        config_json: {
          ...channel.config_json,
          last_inbound_at: processedAt,
          last_error_at: null,
          last_error_message: null,
        },
      })
      .eq("id", channel.id)
      .eq("org_id", orgId);

    return {
      ok: true,
      duplicate: false,
      orgId,
      channelId: channel.id,
      conversationId: finalConversationId,
      messageId: insertedMessage.id,
      contactId,
      companyId,
      intent,
      riskLevel,
    };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Inbound processing failed.";
    await updateInboundEvent(db, eventId, {
      status: "error",
      error_message: messageText.slice(0, 1000),
      processed_at: new Date().toISOString(),
    });
    await db
      .from("channels")
      .update({
        config_json: {
          ...channel.config_json,
          last_error_at: new Date().toISOString(),
          last_error_message: messageText.slice(0, 1000),
        },
      })
      .eq("id", channel.id)
      .eq("org_id", orgId);
    throw error;
  }
}

