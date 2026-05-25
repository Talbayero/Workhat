import { randomUUID } from "crypto";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail, type EmailAddress } from "mailparser";
import nodemailer from "nodemailer";
import { decryptSecret } from "@/lib/email/encryption";
import { resolveMailboxChannel } from "@/lib/email/mailbox-channels";
import { buildStoredDiagnostics, isActiveMailboxStatus } from "@/lib/email/mailbox-status";
import { processInboundEmail, type InboundEmailAddress, type NormalizedInboundEmail } from "@/lib/email/inbound";
import {
  getMailTransportSettings,
  isPasswordRuntimeConnection,
  providerNeedsAppPasswordHint,
} from "@/lib/email/adapters/provider-config";
import { classifyMailboxError, MailboxAdapterError } from "@/lib/email/adapters/errors";
import type {
  AdapterDiagnostics,
  FetchInboundResult,
  MailboxAdapter,
  MailboxAdapterContext,
  MailboxConnectionRecord,
  OutboundMessageInput,
  OutboundSendResult,
  ValidationResult,
} from "@/lib/email/adapters/types";

const MAX_FETCH_MESSAGES = 25;
const FIRST_SYNC_LOOKBACK_DAYS = 7;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function headerValue(parsed: ParsedMail, key: string) {
  const value = parsed.headers.get(key.toLowerCase());
  if (Array.isArray(value)) return value.join(" ");
  return typeof value === "string" ? value : "";
}

function addressToInbound(address: EmailAddress | undefined): InboundEmailAddress | null {
  const email = address?.address?.trim().toLowerCase();
  if (!email) return null;
  return {
    email: email.slice(0, 254),
    name: (address?.name || email.split("@")[0]).slice(0, 100),
  };
}

function addressListToInbound(value: ParsedMail["to"]): InboundEmailAddress[] {
  const addresses = Array.isArray(value) ? value.flatMap((item) => item.value) : value?.value ?? [];
  return addresses.map(addressToInbound).filter((item): item is InboundEmailAddress => Boolean(item));
}

function normalizeReferences(value: ParsedMail["references"]) {
  if (Array.isArray(value)) return value.filter(Boolean).slice(0, 20);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean).slice(0, 20);
  return [];
}

function buildRfcMessageId() {
  return `<workhat-${randomUUID()}@work-hat.com>`;
}

function stripHeaderInjectables(value: string) {
  return value.replace(/[\r\n\0]/g, "");
}

function makeDiagnostics(
  connection: MailboxConnectionRecord,
  overrides: Partial<AdapterDiagnostics> = {}
): AdapterDiagnostics {
  const base = buildStoredDiagnostics(connection);
  return {
    ...base,
    ...overrides,
    checks: overrides.checks ?? base.checks,
  };
}

function getPassword(connection: MailboxConnectionRecord) {
  if (!connection.access_token_ciphertext) {
    throw new MailboxAdapterError("missing_credentials", "Mailbox credentials are missing. Re-enter the mailbox password or app password.");
  }
  return decryptSecret(connection.access_token_ciphertext);
}

function smtpTransport(connection: MailboxConnectionRecord) {
  const settings = getMailTransportSettings(connection);
  const password = getPassword(connection);
  return {
    settings,
    transporter: nodemailer.createTransport({
      host: settings.smtp.host,
      port: settings.smtp.port,
      secure: settings.smtp.secure,
      requireTLS: !settings.smtp.secure,
      auth: {
        user: settings.username,
        pass: password,
      },
    }),
  };
}

function imapClient(connection: MailboxConnectionRecord) {
  const settings = getMailTransportSettings(connection);
  const password = getPassword(connection);
  return {
    settings,
    client: new ImapFlow({
      host: settings.imap.host,
      port: settings.imap.port,
      secure: settings.imap.secure,
      auth: {
        user: settings.username,
        pass: password,
      },
      logger: false,
    }),
  };
}

async function parseFetchedMessage({
  connection,
  uid,
  source,
}: {
  connection: MailboxConnectionRecord;
  uid: number;
  source: Buffer;
}): Promise<NormalizedInboundEmail> {
  const parsed = await simpleParser(source);
  const from = addressToInbound(parsed.from?.value[0]);
  const to = addressListToInbound(parsed.to);
  if (!from) throw new MailboxAdapterError("sync_failed", "Fetched message is missing a valid sender address.");
  if (to.length === 0) to.push({ email: connection.provider_account_email, name: connection.provider_account_email.split("@")[0] });

  const messageId = (parsed.messageId || `imap:${connection.id}:${uid}`).slice(0, 500);
  const references = normalizeReferences(parsed.references);
  const inReplyTo = (parsed.inReplyTo || headerValue(parsed, "in-reply-to") || "").slice(0, 500) || null;
  const externalThreadId = (inReplyTo || references[0] || messageId).slice(0, 500);
  const textBody = (parsed.text || "").trim();
  const htmlBody = typeof parsed.html === "string" ? parsed.html : null;

  return {
    provider: connection.provider,
    externalMessageId: messageId,
    externalThreadId,
    inReplyTo,
    references,
    headers: {
      "message-id": messageId,
      "in-reply-to": inReplyTo ?? "",
      references: references.join(" "),
    },
    from,
    to,
    cc: addressListToInbound(parsed.cc),
    subject: (parsed.subject || "(no subject)").slice(0, 500),
    textBody: textBody || (htmlBody ? "" : "(empty message)"),
    htmlBody,
    receivedAt: (parsed.date ?? new Date()).toISOString(),
    metadata: {
      mailbox_connection_id: connection.id,
      imap_uid: uid,
      rfc_message_id: messageId,
      source: "imap_smtp_adapter",
    },
  };
}

export function createImapSmtpAdapter({ db }: MailboxAdapterContext): MailboxAdapter {
  return {
    key: "imap_smtp",

    supports(connection) {
      return isPasswordRuntimeConnection(connection);
    },

    async validateConnection(connection): Promise<ValidationResult> {
      const checks: AdapterDiagnostics["checks"] = [];

      if (providerNeedsAppPasswordHint(connection.provider, connection.connection_type)) {
        checks.push({
          key: "app_password_hint",
          label: "Provider guidance",
          status: "warn",
          message: "This provider usually requires an app password for IMAP/SMTP access.",
        });
      }

      try {
        const { settings, client } = imapClient(connection);
        if (!settings.imap.host || !settings.smtp.host) {
          throw new MailboxAdapterError("missing_credentials", "IMAP and SMTP host settings are required.");
        }

        await client.connect();
        await client.logout();
        checks.push({
          key: "imap_auth",
          label: "IMAP authentication",
          status: "pass",
          message: `Validated ${settings.imap.host}:${settings.imap.port}.`,
        });
      } catch (error) {
        const classified = classifyMailboxError(error);
        const diagnostics = makeDiagnostics(connection, {
          status: "fail",
          nextAction: classified.message,
          lastErrorCode: classified.code,
          lastErrorMessage: classified.message,
          checks: [
            ...checks,
            {
              key: "imap_auth",
              label: "IMAP authentication",
              status: "fail",
              message: classified.message,
            },
          ],
        });
        return { ok: false, code: classified.code, message: classified.message, diagnostics };
      }

      try {
        const { settings, transporter } = smtpTransport(connection);
        await transporter.verify();
        checks.push({
          key: "smtp_auth",
          label: "SMTP authentication",
          status: "pass",
          message: `Validated ${settings.smtp.host}:${settings.smtp.port}.`,
        });
      } catch (error) {
        const classified = classifyMailboxError(error);
        const code = classified.code === "unknown" ? "smtp_auth_failed" : classified.code;
        const diagnostics = makeDiagnostics(connection, {
          status: "fail",
          nextAction: classified.message,
          lastErrorCode: code,
          lastErrorMessage: classified.message,
          checks: [
            ...checks,
            {
              key: "smtp_auth",
              label: "SMTP authentication",
              status: "fail",
              message: classified.message,
            },
          ],
        });
        return {
          ok: false,
          code,
          message: classified.message,
          diagnostics,
        };
      }

      return {
        ok: true,
        diagnostics: makeDiagnostics(connection, {
          status: "pass",
          nextAction: "Mailbox is active. Inbound polling and outbound sending are available.",
          lastErrorCode: null,
          lastErrorMessage: null,
          checks,
        }),
      };
    },

    async activateConnection(connection) {
      const validation = await this.validateConnection(connection);
      const now = new Date().toISOString();

      if (!validation.ok) {
        await db
          .from("email_connections")
          .update({
            status: "error",
            sync_status: "error",
            error_message: validation.message,
            last_error_code: validation.code,
            last_error_message: validation.message,
            diagnostics_json: validation.diagnostics,
          })
          .eq("id", connection.id)
          .eq("org_id", connection.org_id);
        return validation;
      }

      await ensureAndMarkActive({ db, connection, diagnostics: validation.diagnostics, now });
      return validation;
    },

    async fetchInbound(connection, options = {}): Promise<FetchInboundResult> {
      if (!isActiveMailboxStatus(connection.status)) {
        throw new MailboxAdapterError("connection_not_active", "Mailbox is not active. Validate the connection before importing mail.");
      }
      if (connection.inbound_enabled === false) {
        throw new MailboxAdapterError("connection_not_active", "Inbound polling is disabled for this mailbox.");
      }

      const channel = await resolveMailboxChannel({ db, connection });
      const metadata = asRecord(connection.provider_metadata);
      const imapState = asRecord(metadata.imap_state);
      const lastUid = typeof imapState.last_uid === "number" ? imapState.last_uid : Number(imapState.last_uid || 0);
      const maxMessages = Math.max(1, Math.min(options.maxMessages ?? MAX_FETCH_MESSAGES, 100));
      const { client } = imapClient(connection);
      let scanned = 0;
      let imported = 0;
      let skipped = 0;
      let latestUid = Number.isFinite(lastUid) ? lastUid : 0;

      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const searchQuery = latestUid > 0
          ? { uid: `${latestUid + 1}:*` }
          : { since: new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) };
        const found = await client.search(searchQuery, { uid: true });
        const uids = (Array.isArray(found) ? found : []).filter((uid) => uid > latestUid).slice(-maxMessages);

        for await (const item of client.fetch(uids, { uid: true, source: true }, { uid: true })) {
          if (!item.source) continue;
          scanned += 1;
          latestUid = Math.max(latestUid, item.uid);
          const normalized = await parseFetchedMessage({ connection, uid: item.uid, source: item.source });
          const result = await processInboundEmail({
            db,
            channel,
            message: normalized,
            source: "mailbox.imap",
          });
          if (result.duplicate) skipped += 1;
          else imported += 1;
        }
      } finally {
        lock.release();
        await client.logout().catch(() => undefined);
      }

      const now = new Date().toISOString();
      const providerMetadata = {
        ...metadata,
        imap_state: {
          ...imapState,
          last_uid: latestUid || null,
          last_polled_at: now,
        },
      };

      await db
        .from("email_connections")
        .update({
          status: "active",
          sync_status: "idle",
          last_sync_at: now,
          last_inbound_sync_at: now,
          error_message: null,
          last_error_code: null,
          last_error_message: null,
          provider_metadata: providerMetadata,
          diagnostics_json: {
            ...asRecord(connection.diagnostics_json),
            last_poll: { scanned, imported, skipped, at: now },
          },
        })
        .eq("id", connection.id)
        .eq("org_id", connection.org_id);

      return {
        scanned,
        imported,
        skipped,
        latestCursor: latestUid ? String(latestUid) : null,
      };
    },

    async sendOutbound(connection, input: OutboundMessageInput): Promise<OutboundSendResult> {
      if (!isActiveMailboxStatus(connection.status)) {
        throw new MailboxAdapterError("connection_not_active", "Mailbox is not active. Validate the connection before sending replies.");
      }
      if (connection.outbound_enabled === false) {
        throw new MailboxAdapterError("connection_not_active", "Outbound sending is disabled for this mailbox.");
      }

      const { data: conversation, error: conversationError } = await db
        .from("conversations")
        .select("id, subject, contacts(email)")
        .eq("id", input.conversationId)
        .eq("org_id", input.orgId)
        .maybeSingle();
      if (conversationError || !conversation) throw new Error("Conversation not found.");

      const contact = (conversation as { contacts?: { email?: string | null } | { email?: string | null }[] | null }).contacts;
      const contactEmail = Array.isArray(contact) ? contact[0]?.email : contact?.email;
      if (!contactEmail) throw new Error("This conversation has no customer email to reply to.");

      const { data: inbound } = await db
        .from("messages")
        .select("metadata_json")
        .eq("org_id", input.orgId)
        .eq("conversation_id", input.conversationId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const inboundMetadata = asRecord((inbound as { metadata_json?: unknown } | null)?.metadata_json);
      const inReplyTo = typeof inboundMetadata.rfc_message_id === "string"
        ? inboundMetadata.rfc_message_id
        : typeof inboundMetadata.external_message_id === "string"
        ? inboundMetadata.external_message_id
        : undefined;
      const subject = (conversation as { subject?: string | null }).subject || "(no subject)";
      const normalizedSubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
      const rfcMessageId = buildRfcMessageId();
      const { settings, transporter } = smtpTransport(connection);
      const fromName = settings.senderName || connection.display_name || connection.provider_account_email;
      const sent = await transporter.sendMail({
        from: `${stripHeaderInjectables(fromName)} <${stripHeaderInjectables(connection.provider_account_email)}>`,
        to: contactEmail,
        subject: normalizedSubject,
        text: input.body,
        messageId: rfcMessageId,
        inReplyTo,
        references: inReplyTo ? [inReplyTo] : undefined,
      });

      const now = new Date().toISOString();
      await db
        .from("email_connections")
        .update({
          last_outbound_send_at: now,
          error_message: null,
          last_error_code: null,
          last_error_message: null,
        })
        .eq("id", connection.id)
        .eq("org_id", connection.org_id);

      return {
        connectionId: connection.id,
        provider: connection.provider,
        providerMessageId: sent.messageId || rfcMessageId,
        providerThreadId: String(input.conversationId),
        rfcMessageId,
        sentFrom: connection.provider_account_email,
      };
    },

    async refreshCredentials(connection) {
      return connection;
    },

    async getDiagnostics(connection) {
      return makeDiagnostics(connection);
    },
  };
}

async function ensureAndMarkActive({
  db,
  connection,
  diagnostics,
  now,
}: {
  db: MailboxAdapterContext["db"];
  connection: MailboxConnectionRecord;
  diagnostics: AdapterDiagnostics;
  now: string;
}) {
  await resolveMailboxChannel({ db, connection });
  const { error } = await db
    .from("email_connections")
    .update({
      status: "active",
      sync_status: "idle",
      inbound_enabled: true,
      outbound_enabled: true,
      last_validated_at: now,
      error_message: null,
      last_error_code: null,
      last_error_message: null,
      diagnostics_json: diagnostics,
    })
    .eq("id", connection.id)
    .eq("org_id", connection.org_id);
  if (error) throw new Error(error.message);
}

