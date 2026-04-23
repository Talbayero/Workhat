import type { AdapterErrorCode } from "@/lib/email-connector/adapters/types";

export class MailboxAdapterError extends Error {
  code: AdapterErrorCode;

  constructor(code: AdapterErrorCode, message: string) {
    super(message);
    this.name = "MailboxAdapterError";
    this.code = code;
  }
}

export function classifyMailboxError(error: unknown): { code: AdapterErrorCode; message: string } {
  if (error instanceof MailboxAdapterError) {
    return { code: error.code, message: error.message };
  }

  const raw = error instanceof Error ? error.message : String(error || "Mailbox operation failed.");
  const normalized = raw.toLowerCase();

  if (normalized.includes("invalid login") || normalized.includes("authenticationfailed") || normalized.includes("auth failed")) {
    return { code: "imap_auth_failed", message: "IMAP authentication failed. Verify the mailbox credentials or use an app password if your provider requires one." };
  }

  if (normalized.includes("535") || normalized.includes("authentication unsuccessful") || normalized.includes("invalid credentials")) {
    return { code: "smtp_auth_failed", message: "SMTP authentication failed. Verify the outbound credentials and provider SMTP settings." };
  }

  if (normalized.includes("self signed") || normalized.includes("certificate") || normalized.includes("tls") || normalized.includes("ssl")) {
    return { code: "tls_failed", message: "TLS negotiation failed. Check the SSL/TLS setting and provider host/port values." };
  }

  if (normalized.includes("timeout") || normalized.includes("econnrefused") || normalized.includes("enotfound") || normalized.includes("econnreset")) {
    return { code: "mailbox_unreachable", message: "Mailbox server is unreachable. Check the provider host, port, TLS setting, and network availability." };
  }

  return { code: "unknown", message: raw.slice(0, 500) };
}
