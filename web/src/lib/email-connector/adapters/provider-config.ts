import type { MailboxConnectionRecord, MailboxConnectionType, MailboxProvider } from "@/lib/email-connector/adapters/types";

export type MailTransportSettings = {
  username: string;
  imap: {
    host: string;
    port: number;
    secure: boolean;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
  };
  senderName: string | null;
};

export const PASSWORD_RUNTIME_TYPES = new Set<MailboxConnectionType>([
  "mailbox_password",
  "app_password",
  "imap_smtp",
]);

export const PROVIDER_DEFAULTS: Partial<Record<MailboxProvider, Omit<MailTransportSettings, "username" | "senderName">>> = {
  gmail: {
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
  },
  outlook: {
    imap: { host: "imap-mail.outlook.com", port: 993, secure: true },
    smtp: { host: "smtp-mail.outlook.com", port: 587, secure: false },
  },
  microsoft365: {
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
  },
  icloud: {
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
  },
  zoho: {
    imap: { host: "imap.zoho.com", port: 993, secure: true },
    smtp: { host: "smtp.zoho.com", port: 465, secure: true },
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function isPasswordRuntimeConnection(connection: MailboxConnectionRecord) {
  return PASSWORD_RUNTIME_TYPES.has(connection.connection_type as MailboxConnectionType);
}

export function getMailTransportSettings(connection: MailboxConnectionRecord): MailTransportSettings {
  const provider = connection.provider as MailboxProvider;
  const metadata = asRecord(connection.provider_metadata);
  const credentialMetadata = asRecord(connection.credential_metadata);
  const imap = asRecord(metadata.imap);
  const smtp = asRecord(metadata.smtp);
  const defaults = PROVIDER_DEFAULTS[provider];

  if (!defaults && connection.connection_type !== "imap_smtp") {
    throw new Error("IMAP and SMTP host settings are required for this provider.");
  }

  const defaultImap = defaults?.imap ?? { host: "", port: 993, secure: true };
  const defaultSmtp = defaults?.smtp ?? { host: "", port: 587, secure: false };
  const username =
    asString(credentialMetadata.username) ||
    asString(metadata.username) ||
    connection.provider_account_email;

  return {
    username,
    senderName: asString(metadata.sender_name) || null,
    imap: {
      host: asString(imap.host) || defaultImap.host,
      port: asNumber(imap.port, defaultImap.port),
      secure: asBoolean(imap.ssl ?? imap.secure, defaultImap.secure),
    },
    smtp: {
      host: asString(smtp.host) || defaultSmtp.host,
      port: asNumber(smtp.port, defaultSmtp.port),
      secure: asBoolean(smtp.ssl ?? smtp.secure, defaultSmtp.secure),
    },
  };
}

export function describeConnectionType(connectionType: string) {
  if (connectionType === "mailbox_password") return "mailbox login and password";
  if (connectionType === "app_password") return "app password";
  if (connectionType === "imap_smtp") return "IMAP / SMTP";
  if (connectionType === "oauth") return "OAuth / xOAuth";
  return connectionType;
}

export function providerNeedsAppPasswordHint(provider: string, connectionType: string) {
  return connectionType === "mailbox_password" && ["gmail", "icloud", "outlook", "microsoft365"].includes(provider);
}

export function providerHasDefaultMailSettings(provider: string): provider is keyof typeof PROVIDER_DEFAULTS {
  return provider in PROVIDER_DEFAULTS;
}
