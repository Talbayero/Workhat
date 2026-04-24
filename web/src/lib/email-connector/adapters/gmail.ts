import { sendConversationReplyWithGmail } from "@/lib/email-connector/gmail-sender";
import {
  getFreshGmailAccessToken,
  importRecentGmailInbox,
  markGmailSyncError,
  markGmailSyncSuccess,
  type EmailConnection,
} from "@/lib/email-connector/gmail-importer";
import { buildStoredDiagnostics, isActiveMailboxStatus } from "@/lib/email-connector/mailbox-status";
import type {
  AdapterDiagnostics,
  FetchInboundResult,
  MailboxAdapter,
  MailboxAdapterContext,
  MailboxConnectionRecord,
  OutboundMessageInput,
  OutboundSendResult,
  ValidationResult,
} from "@/lib/email-connector/adapters/types";

function toGmailConnection(connection: MailboxConnectionRecord): EmailConnection {
  return {
    id: connection.id,
    org_id: connection.org_id,
    provider_account_email: connection.provider_account_email,
    access_token_ciphertext: connection.access_token_ciphertext,
    refresh_token_ciphertext: connection.refresh_token_ciphertext,
    token_expires_at: connection.token_expires_at,
    last_history_id: connection.last_history_id,
  };
}

function diagnostics(connection: MailboxConnectionRecord, overrides: Partial<AdapterDiagnostics> = {}): AdapterDiagnostics {
  return {
    ...buildStoredDiagnostics(connection),
    ...overrides,
  };
}

export function createGmailAdapter({ db }: MailboxAdapterContext): MailboxAdapter {
  return {
    key: "gmail_oauth",

    supports(connection) {
      return connection.provider === "gmail" && connection.connection_type === "oauth";
    },

    async validateConnection(connection): Promise<ValidationResult> {
      try {
        await getFreshGmailAccessToken(db, toGmailConnection(connection));
        return {
          ok: true,
          diagnostics: diagnostics(connection, {
            status: "pass",
            nextAction: "Gmail OAuth is active. Import latest email or repair live updates when needed.",
            checks: [
              {
                key: "oauth_token",
                label: "OAuth token",
                status: "pass",
                message: "Access token is usable or refreshable.",
              },
            ],
          }),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Gmail validation failed.";
        return {
          ok: false,
          code: "credentials_rejected",
          message,
          diagnostics: diagnostics(connection, {
            status: "fail",
            lastErrorCode: "credentials_rejected",
            lastErrorMessage: message,
            nextAction: "Reconnect Gmail through OAuth.",
            checks: [
              {
                key: "oauth_token",
                label: "OAuth token",
                status: "fail",
                message,
              },
            ],
          }),
        };
      }
    },

    async activateConnection(connection) {
      const result = await this.validateConnection(connection);
      const now = new Date().toISOString();
      if (result.ok) {
        await db
          .from("email_connections")
          .update({
            status: "active",
            inbound_enabled: true,
            outbound_enabled: true,
            last_validated_at: now,
            error_message: null,
            last_error_code: null,
            last_error_message: null,
            diagnostics_json: result.diagnostics,
          })
          .eq("id", connection.id)
          .eq("org_id", connection.org_id);
      } else {
        await db
          .from("email_connections")
          .update({
            status: "error",
            error_message: result.message,
            last_error_code: result.code,
            last_error_message: result.message,
            diagnostics_json: result.diagnostics,
          })
          .eq("id", connection.id)
          .eq("org_id", connection.org_id);
      }
      return result;
    },

    async fetchInbound(connection, options = {}): Promise<FetchInboundResult> {
      if (!isActiveMailboxStatus(connection.status)) {
        throw new Error("Gmail connection is not active. Reconnect Gmail before syncing.");
      }
      const result = await importRecentGmailInbox({
        db,
        connection: toGmailConnection(connection),
        maxResults: options.maxMessages ?? 25,
      });
      await markGmailSyncSuccess({ db, connectionId: connection.id, result });
      await db
        .from("email_connections")
        .update({ last_inbound_sync_at: new Date().toISOString() })
        .eq("id", connection.id)
        .eq("org_id", connection.org_id);
      return {
        scanned: result.scanned,
        imported: result.imported,
        skipped: result.skipped,
        skipReasons: result.skipReasons ?? {},
        latestCursor: result.latestHistoryId,
      };
    },

    async sendOutbound(_connection, input: OutboundMessageInput): Promise<OutboundSendResult> {
      const result = await sendConversationReplyWithGmail({
        db,
        orgId: input.orgId,
        conversationId: input.conversationId,
        body: input.body,
      });
      if (!result) throw new Error("No active Gmail OAuth mailbox is available for this workspace.");
      return result;
    },

    async refreshCredentials(connection) {
      await getFreshGmailAccessToken(db, toGmailConnection(connection));
      return connection;
    },

    async getDiagnostics(connection) {
      return diagnostics(connection);
    },
  };
}

export async function markGmailAdapterError({
  db,
  connectionId,
  message,
}: {
  db: MailboxAdapterContext["db"];
  connectionId: string;
  message: string;
}) {
  await markGmailSyncError({ db, connectionId, message });
  await db
    .from("email_connections")
    .update({
      last_error_code: "sync_failed",
      last_error_message: message,
      diagnostics_json: { last_error: { code: "sync_failed", message, at: new Date().toISOString() } },
    })
    .eq("id", connectionId);
}
