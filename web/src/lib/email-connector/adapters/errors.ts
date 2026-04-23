import type { AdapterErrorCode } from "@/lib/email-connector/adapters/types";

export class MailboxAdapterError extends Error {
  code: AdapterErrorCode;

  constructor(code: AdapterErrorCode, message: string) {
    super(message);
    this.name = "MailboxAdapterError";
    this.code = code;
  }
}

function buildErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const record = error as Error & {
      code?: string;
      response?: string;
      responseText?: string;
      command?: string;
      reason?: string;
      cause?: unknown;
    };
    const causeMessage =
      record.cause instanceof Error
        ? record.cause.message
        : typeof record.cause === "string"
        ? record.cause
        : "";

    return [
      record.message,
      record.code,
      record.response,
      record.responseText,
      record.command,
      record.reason,
      causeMessage,
    ]
      .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index)
      .join(" | ");
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return [
      typeof record.message === "string" ? record.message : "",
      typeof record.code === "string" ? record.code : "",
      typeof record.response === "string" ? record.response : "",
      typeof record.responseText === "string" ? record.responseText : "",
      typeof record.command === "string" ? record.command : "",
      typeof record.reason === "string" ? record.reason : "",
    ]
      .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index)
      .join(" | ");
  }

  return String(error || "Mailbox operation failed.");
}

export function classifyMailboxError(error: unknown): { code: AdapterErrorCode; message: string } {
  if (error instanceof MailboxAdapterError) {
    return { code: error.code, message: error.message };
  }

  const raw = buildErrorDetails(error) || "Mailbox operation failed.";
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("invalid login") ||
    normalized.includes("authenticationfailed") ||
    normalized.includes("auth failed") ||
    normalized.includes("login failed") ||
    normalized.includes("authentication failed")
  ) {
    return { code: "imap_auth_failed", message: "IMAP authentication failed. Verify the mailbox credentials or use an app password if your provider requires one." };
  }

  if (
    normalized.includes("535") ||
    normalized.includes("authentication unsuccessful") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("eauth")
  ) {
    return { code: "smtp_auth_failed", message: "SMTP authentication failed. Verify the outbound credentials and provider SMTP settings." };
  }

  if (normalized.includes("self signed") || normalized.includes("certificate") || normalized.includes("tls") || normalized.includes("ssl")) {
    return { code: "tls_failed", message: "TLS negotiation failed. Check the SSL/TLS setting and provider host/port values." };
  }

  if (normalized.includes("timeout") || normalized.includes("econnrefused") || normalized.includes("enotfound") || normalized.includes("econnreset")) {
    return { code: "mailbox_unreachable", message: "Mailbox server is unreachable. Check the provider host, port, TLS setting, and network availability." };
  }

  if (normalized === "command failed" || normalized.startsWith("command failed |")) {
    return {
      code: "credentials_rejected",
      message: "Mailbox validation failed. Verify the mailbox credentials and provider settings. If the provider uses 2FA or blocks direct password login, use an app password instead.",
    };
  }

  return { code: "unknown", message: raw.slice(0, 500) };
}
