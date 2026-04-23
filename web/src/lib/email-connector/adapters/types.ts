import type { NormalizedInboundEmail } from "@/lib/email-connector/inbound";

export type MailboxProvider =
  | "gmail"
  | "microsoft365"
  | "outlook"
  | "exchange"
  | "zoho"
  | "icloud"
  | "custom"
  | "custom_inbound";

export type MailboxConnectionType =
  | "oauth"
  | "mailbox_password"
  | "app_password"
  | "imap_smtp"
  | "custom_inbound";

export type MailboxConnectionStatus =
  | "configured"
  | "validating"
  | "active"
  | "error"
  | "disconnected";

export type MailboxDiagnosticStatus = "pass" | "warn" | "fail";

export type AdapterErrorCode =
  | "credentials_rejected"
  | "imap_auth_failed"
  | "smtp_auth_failed"
  | "tls_failed"
  | "provider_requires_app_password"
  | "connection_not_supported"
  | "connection_not_active"
  | "missing_credentials"
  | "mailbox_unreachable"
  | "send_failed"
  | "sync_failed"
  | "unknown";

export type MailboxConnectionRecord = {
  id: string;
  org_id: string;
  provider: MailboxProvider | string;
  connection_type: MailboxConnectionType | string;
  provider_account_email: string;
  display_name: string | null;
  status: string;
  sync_status: string | null;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  scopes?: string[] | null;
  last_history_id: string | null;
  watch_expires_at: string | null;
  last_sync_at: string | null;
  inbound_enabled?: boolean | null;
  outbound_enabled?: boolean | null;
  last_validated_at?: string | null;
  last_inbound_sync_at?: string | null;
  last_outbound_send_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  error_message: string | null;
  diagnostics_json?: Record<string, unknown> | null;
  credential_metadata?: Record<string, unknown> | null;
  provider_metadata: Record<string, unknown> | null;
};

export type AdapterCheck = {
  key: string;
  label: string;
  status: MailboxDiagnosticStatus;
  message: string;
};

export type AdapterDiagnostics = {
  status: MailboxDiagnosticStatus;
  provider: string;
  connectionType: string;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  lastValidatedAt: string | null;
  lastInboundSyncAt: string | null;
  lastOutboundSendAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  nextAction: string;
  checks: AdapterCheck[];
};

export type ValidationResult = {
  ok: true;
  diagnostics: AdapterDiagnostics;
} | {
  ok: false;
  code: AdapterErrorCode;
  message: string;
  diagnostics: AdapterDiagnostics;
};

export type FetchInboundResult = {
  scanned: number;
  imported: number;
  skipped: number;
  latestCursor: string | null;
};

export type OutboundMessageInput = {
  orgId: string;
  conversationId: string;
  body: string;
};

export type OutboundSendResult = {
  provider: string;
  providerMessageId: string;
  providerThreadId: string;
  rfcMessageId: string;
  sentFrom: string;
  simulated?: boolean;
};

export type MailboxAdapterContext = {
  db: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;
};

export interface MailboxAdapter {
  key: string;
  supports(connection: MailboxConnectionRecord): boolean;
  validateConnection(connection: MailboxConnectionRecord): Promise<ValidationResult>;
  activateConnection(connection: MailboxConnectionRecord): Promise<ValidationResult>;
  fetchInbound(connection: MailboxConnectionRecord, options?: { maxMessages?: number }): Promise<FetchInboundResult>;
  sendOutbound(connection: MailboxConnectionRecord, input: OutboundMessageInput): Promise<OutboundSendResult>;
  refreshCredentials(connection: MailboxConnectionRecord): Promise<MailboxConnectionRecord>;
  getDiagnostics(connection: MailboxConnectionRecord): Promise<AdapterDiagnostics>;
}

export type ParsedMailboxMessage = NormalizedInboundEmail & {
  uid?: number;
};
