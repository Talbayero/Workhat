import type {
  AdapterDiagnostics,
  MailboxConnectionRecord,
  MailboxConnectionStatus,
} from "@/lib/email-connector/adapters/types";

export function isActiveMailboxStatus(status: string | null | undefined) {
  return status === "active" || status === "connected";
}

export function normalizeMailboxStatus(status: string | null | undefined): MailboxConnectionStatus {
  if (status === "connected") return "active";
  if (status === "needs_reconnect") return "configured";
  if (status === "disabled") return "disconnected";
  if (status === "validating" || status === "active" || status === "error" || status === "disconnected") return status;
  return "configured";
}

export function buildStoredDiagnostics(connection: MailboxConnectionRecord): AdapterDiagnostics {
  const status = normalizeMailboxStatus(connection.status);
  const errorCode = connection.last_error_code ?? null;
  const errorMessage = connection.last_error_message ?? connection.error_message ?? null;
  const inboundEnabled = connection.inbound_enabled !== false;
  const outboundEnabled = connection.outbound_enabled !== false;

  return {
    status: status === "active" ? "pass" : status === "error" ? "fail" : "warn",
    provider: connection.provider,
    connectionType: connection.connection_type,
    inboundEnabled,
    outboundEnabled,
    lastValidatedAt: connection.last_validated_at ?? null,
    lastInboundSyncAt: connection.last_inbound_sync_at ?? connection.last_sync_at ?? null,
    lastOutboundSendAt: connection.last_outbound_send_at ?? null,
    lastErrorCode: errorCode,
    lastErrorMessage: errorMessage,
    nextAction:
      status === "active"
        ? "Mailbox is active. Use Import latest email to poll inbound mail."
        : status === "error"
        ? "Review the error, correct mailbox settings or credentials, then validate again."
        : "Validate the mailbox connection to activate inbound polling and outbound sending.",
    checks: [
      {
        key: "status",
        label: "Connection status",
        status: status === "active" ? "pass" : status === "error" ? "fail" : "warn",
        message: status,
      },
      {
        key: "inbound_enabled",
        label: "Inbound",
        status: inboundEnabled ? "pass" : "warn",
        message: inboundEnabled ? "Enabled." : "Inbound polling is disabled for this mailbox.",
      },
      {
        key: "outbound_enabled",
        label: "Outbound",
        status: outboundEnabled ? "pass" : "warn",
        message: outboundEnabled ? "Enabled." : "Outbound sending is disabled for this mailbox.",
      },
    ],
  };
}
