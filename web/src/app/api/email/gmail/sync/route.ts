import { NextResponse } from "next/server";
import { decryptSecret, encryptSecret } from "@/lib/email-connector/encryption";
import {
  fetchGmailMessage,
  listGmailInboxMessages,
  refreshGmailAccessToken,
  tokenExpiryDate,
  type GmailMessage,
} from "@/lib/email-connector/google";
import { createClient } from "@/lib/supabase/server";

type AppUser = {
  id: string;
  org_id: string;
  role: string;
};

type EmailConnection = {
  id: string;
  org_id: string;
  provider_account_email: string;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
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

async function ensureContactAndCompany({
  supabase,
  orgId,
  fromName,
  fromEmail,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  fromName: string;
  fromEmail: string;
}) {
  const [firstName, ...restName] = fromName.split(" ");
  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id, company_id")
    .eq("org_id", orgId)
    .eq("email", fromEmail)
    .single();

  let contactId = (existingContact as { id: string; company_id: string | null } | null)?.id ?? null;
  let companyId = (existingContact as { id: string; company_id: string | null } | null)?.company_id ?? null;

  if (contactId) {
    await supabase
      .from("contacts")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", contactId);
  } else {
    const { data: contact, error } = await supabase
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
    const { data: existingCompany } = await supabase
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
      const { data: company } = await supabase
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
      await supabase
        .from("contacts")
        .update({ company_id: companyId })
        .eq("id", contactId)
        .is("company_id", null);
    }
  }

  return { contactId, companyId };
}

export async function POST() {
  const supabase = await createClient();
  const appUser = await getAppUser(supabase);
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "manager"].includes(appUser.role)) {
    return NextResponse.json({ error: "Only admins and managers can sync Gmail." }, { status: 403 });
  }

  const { data: connection, error: connectionError } = await supabase
    .from("email_connections")
    .select("id, org_id, provider_account_email, access_token_ciphertext, refresh_token_ciphertext, token_expires_at")
    .eq("org_id", appUser.org_id)
    .eq("provider", "gmail")
    .eq("status", "connected")
    .limit(1)
    .single();

  if (connectionError || !connection) {
    return NextResponse.json({ error: "Connect Gmail before syncing." }, { status: 400 });
  }

  await supabase
    .from("email_connections")
    .update({ sync_status: "syncing", error_message: null })
    .eq("id", connection.id);

  try {
    const accessToken = await getFreshAccessToken(supabase, connection as EmailConnection);
    const { data: channel } = await supabase
      .from("channels")
      .select("id")
      .eq("org_id", appUser.org_id)
      .eq("type", "email")
      .single();

    if (!channel) throw new Error("No email channel found for this workspace.");

    const list = await listGmailInboxMessages({ accessToken, maxResults: 10 });
    let imported = 0;
    let skipped = 0;
    let latestHistoryId: string | null = null;

    for (const item of list.messages ?? []) {
      const message = await fetchGmailMessage(accessToken, item.id);
      latestHistoryId = message.historyId ?? latestHistoryId;
      const channelMessageId = `gmail:${message.id}`;

      const { data: existingMessage } = await supabase
        .from("messages")
        .select("id")
        .eq("org_id", appUser.org_id)
        .eq("channel_message_id", channelMessageId)
        .single();

      if (existingMessage) {
        skipped += 1;
        continue;
      }

      const from = parseEmailAddress(getHeader(message, "From"));
      const subject = getHeader(message, "Subject") || "(no subject)";
      const { text, html } = extractBodies(message.payload);
      const bodyText = stripQuotedReply(text || (html ? stripHtml(html) : message.snippet ?? ""));
      const preview = bodyText.replace(/\s+/g, " ").trim().slice(0, 160);
      const intent = classifyIntent(subject, bodyText);
      const riskLevel = scoreRisk(subject, bodyText);
      const { contactId, companyId } = await ensureContactAndCompany({
        supabase,
        orgId: appUser.org_id,
        fromName: from.name,
        fromEmail: from.email,
      });

      const externalThreadId = `gmail:${message.threadId}`;
      let conversationId: string | null = null;
      const { data: existingConversation } = await supabase
        .from("conversations")
        .select("id")
        .eq("org_id", appUser.org_id)
        .eq("external_thread_id", externalThreadId)
        .single();

      if (existingConversation) {
        conversationId = existingConversation.id;
        await supabase
          .from("conversations")
          .update({
            preview,
            last_message_at: message.internalDate
              ? new Date(Number(message.internalDate)).toISOString()
              : new Date().toISOString(),
            ...(riskLevel === "red" ? { risk_level: "red" } : {}),
          })
          .eq("id", conversationId);
      } else {
        const { data: conversation, error: conversationError } = await supabase
          .from("conversations")
          .insert({
            org_id: appUser.org_id,
            contact_id: contactId,
            company_id: companyId,
            channel_id: channel.id,
            subject,
            status: "open",
            priority: riskLevel === "red" ? "urgent" : "normal",
            risk_level: riskLevel,
            ai_confidence: "yellow",
            intent,
            preview,
            assigned_to_name: "",
            last_message_at: message.internalDate
              ? new Date(Number(message.internalDate)).toISOString()
              : new Date().toISOString(),
            external_thread_id: externalThreadId,
          })
          .select("id")
          .single();

        if (conversationError || !conversation) {
          throw new Error(conversationError?.message ?? "Failed to create conversation.");
        }
        conversationId = conversation.id;
      }

      const { error: messageError } = await supabase.from("messages").insert({
        org_id: appUser.org_id,
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
        created_at: message.internalDate
          ? new Date(Number(message.internalDate)).toISOString()
          : new Date().toISOString(),
      });

      if (messageError) throw new Error(messageError.message);
      imported += 1;
    }

    await supabase
      .from("email_connections")
      .update({
        sync_status: "idle",
        last_sync_at: new Date().toISOString(),
        last_history_id: latestHistoryId,
        error_message: null,
      })
      .eq("id", connection.id);

    return NextResponse.json({ imported, skipped, scanned: list.messages?.length ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail sync failed.";
    await supabase
      .from("email_connections")
      .update({ sync_status: "error", status: "error", error_message: message })
      .eq("id", connection.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
