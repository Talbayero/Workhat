import { createGmailAdapter, markGmailAdapterError } from "@/lib/email/adapters/gmail";
import { createImapSmtpAdapter } from "@/lib/email/adapters/imap-smtp";
import { classifyMailboxError } from "@/lib/email/adapters/errors";
import { isActiveMailboxStatus } from "@/lib/email/mailbox-status";
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

function adapters(ctx: MailboxAdapterContext): MailboxAdapter[] {
  return [
    createGmailAdapter(ctx),
    createImapSmtpAdapter(ctx),
  ];
}

export function getMailboxAdapter(ctx: MailboxAdapterContext, connection: MailboxConnectionRecord) {
  const adapter = adapters(ctx).find((candidate) => candidate.supports(connection));
  if (!adapter) {
    throw new Error(`No mailbox adapter supports ${connection.provider}/${connection.connection_type}.`);
  }
  return adapter;
}

export async function validateAndActivateMailboxConnection(
  ctx: MailboxAdapterContext,
  connection: MailboxConnectionRecord
): Promise<ValidationResult> {
  await ctx.db
    .from("email_connections")
    .update({
      status: "validating",
      sync_status: "idle",
      error_message: null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("id", connection.id)
    .eq("org_id", connection.org_id);

  const adapter = getMailboxAdapter(ctx, { ...connection, status: "validating" });
  try {
    return await adapter.activateConnection({ ...connection, status: "validating" });
  } catch (error) {
    const classified = classifyMailboxError(error);
    const diagnostics = {
      status: "fail" as const,
      provider: connection.provider,
      connectionType: connection.connection_type,
      inboundEnabled: connection.inbound_enabled !== false,
      outboundEnabled: connection.outbound_enabled !== false,
      lastValidatedAt: connection.last_validated_at ?? null,
      lastInboundSyncAt: connection.last_inbound_sync_at ?? connection.last_sync_at ?? null,
      lastOutboundSendAt: connection.last_outbound_send_at ?? null,
      lastErrorCode: classified.code,
      lastErrorMessage: classified.message,
      nextAction: classified.message,
      checks: [
        {
          key: "activation",
          label: "Mailbox activation",
          status: "fail" as const,
          message: classified.message,
        },
      ],
    };

    await ctx.db
      .from("email_connections")
      .update({
        status: "error",
        sync_status: "error",
        error_message: classified.message,
        last_error_code: classified.code,
        last_error_message: classified.message,
        diagnostics_json: diagnostics,
      })
      .eq("id", connection.id)
      .eq("org_id", connection.org_id);

    return {
      ok: false,
      code: classified.code,
      message: classified.message,
      diagnostics,
    };
  }
}

export async function fetchInboundForConnection(
  ctx: MailboxAdapterContext,
  connection: MailboxConnectionRecord,
  options?: { maxMessages?: number }
): Promise<FetchInboundResult> {
  const adapter = getMailboxAdapter(ctx, connection);
  await ctx.db
    .from("email_connections")
    .update({ sync_status: "syncing", error_message: null })
    .eq("id", connection.id)
    .eq("org_id", connection.org_id);

  try {
    return await adapter.fetchInbound(connection, options);
  } catch (error) {
    const classified = classifyMailboxError(error);
    if (connection.provider === "gmail" && connection.connection_type === "oauth") {
      await markGmailAdapterError({ db: ctx.db, connectionId: connection.id, message: classified.message });
    } else {
      await ctx.db
        .from("email_connections")
        .update({
          status: "error",
          sync_status: "error",
          error_message: classified.message,
          last_error_code: classified.code,
          last_error_message: classified.message,
          diagnostics_json: {
            last_error: {
              code: classified.code,
              message: classified.message,
              at: new Date().toISOString(),
            },
          },
        })
        .eq("id", connection.id)
        .eq("org_id", connection.org_id);
    }
    throw error;
  }
}

export async function sendOutboundForConnection(
  ctx: MailboxAdapterContext,
  connection: MailboxConnectionRecord,
  input: OutboundMessageInput
): Promise<OutboundSendResult> {
  if (!isActiveMailboxStatus(connection.status)) {
    throw new Error("Mailbox is not active. Validate the mailbox before sending replies.");
  }
  const adapter = getMailboxAdapter(ctx, connection);
  return adapter.sendOutbound(connection, input);
}

export async function getMailboxDiagnostics(
  ctx: MailboxAdapterContext,
  connection: MailboxConnectionRecord
): Promise<AdapterDiagnostics> {
  const adapter = getMailboxAdapter(ctx, connection);
  return adapter.getDiagnostics(connection);
}

export type {
  AdapterDiagnostics,
  FetchInboundResult,
  MailboxConnectionRecord,
  OutboundMessageInput,
  OutboundSendResult,
  ValidationResult,
};

