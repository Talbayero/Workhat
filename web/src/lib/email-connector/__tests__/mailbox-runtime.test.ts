import { getMailTransportSettings, providerNeedsAppPasswordHint } from "@/lib/email-connector/adapters/provider-config";
import { getMailboxAdapter } from "@/lib/email-connector/adapters";
import { classifyMailboxError } from "@/lib/email-connector/adapters/errors";
import { buildStoredDiagnostics, isActiveMailboxStatus, normalizeMailboxStatus } from "@/lib/email-connector/mailbox-status";
import type { MailboxConnectionRecord } from "@/lib/email-connector/adapters/types";

function connection(overrides: Partial<MailboxConnectionRecord> = {}): MailboxConnectionRecord {
  return {
    id: "conn-1",
    org_id: "org-1",
    provider: "zoho",
    connection_type: "imap_smtp",
    provider_account_email: "support@example.com",
    display_name: "Support",
    status: "configured",
    sync_status: "idle",
    access_token_ciphertext: "ciphertext",
    refresh_token_ciphertext: null,
    token_expires_at: null,
    scopes: [],
    last_history_id: null,
    watch_expires_at: null,
    last_sync_at: null,
    inbound_enabled: true,
    outbound_enabled: true,
    last_validated_at: null,
    last_inbound_sync_at: null,
    last_outbound_send_at: null,
    last_error_code: null,
    last_error_message: null,
    error_message: null,
    diagnostics_json: {},
    credential_metadata: { username: "support@example.com" },
    provider_metadata: {
      username: "support@example.com",
      sender_name: "Support Team",
      imap: { host: "imap.example.com", port: 993, ssl: true },
      smtp: { host: "smtp.example.com", port: 587, ssl: false },
    },
    ...overrides,
  };
}

describe("mailbox runtime status", () => {
  it("normalizes legacy statuses into V2 runtime states", () => {
    expect(normalizeMailboxStatus("draft")).toBe("draft");
    expect(normalizeMailboxStatus("connected")).toBe("active");
    expect(normalizeMailboxStatus("needs_reconnect")).toBe("configured");
    expect(normalizeMailboxStatus("disabled")).toBe("disconnected");
    expect(isActiveMailboxStatus("active")).toBe(true);
    expect(isActiveMailboxStatus("connected")).toBe(true);
    expect(isActiveMailboxStatus("configured")).toBe(false);
  });

  it("builds operator diagnostics from stored connection state", () => {
    const diagnostics = buildStoredDiagnostics(connection({
      status: "error",
      last_error_code: "imap_auth_failed",
      last_error_message: "IMAP authentication failed.",
    }));

    expect(diagnostics.status).toBe("fail");
    expect(diagnostics.lastErrorCode).toBe("imap_auth_failed");
    expect(diagnostics.nextAction).toContain("Review the error");
  });
});

describe("mail transport settings", () => {
  it("keeps provider and connection type separate for IMAP/SMTP", () => {
    const settings = getMailTransportSettings(connection());
    expect(settings.username).toBe("support@example.com");
    expect(settings.imap.host).toBe("imap.example.com");
    expect(settings.smtp.host).toBe("smtp.example.com");
  });

  it("uses provider defaults for app-password style setup", () => {
    const settings = getMailTransportSettings(connection({
      provider: "zoho",
      connection_type: "app_password",
      provider_metadata: { sender_name: "Zoho Support" },
      credential_metadata: {},
    }));

    expect(settings.imap.host).toBe("imappro.zoho.com");
    expect(settings.smtp.host).toBe("smtppro.zoho.com");
    expect(settings.senderName).toBe("Zoho Support");
  });

  it("warns when a direct mailbox password is likely the wrong auth method", () => {
    expect(providerNeedsAppPasswordHint("gmail", "mailbox_password")).toBe(true);
    expect(providerNeedsAppPasswordHint("zoho", "mailbox_password")).toBe(false);
  });
});

describe("adapter selection", () => {
  const db = { from: jest.fn() } as never;

  it("selects Gmail OAuth adapter", () => {
    const adapter = getMailboxAdapter({ db }, connection({ provider: "gmail", connection_type: "oauth" }));
    expect(adapter.key).toBe("gmail_oauth");
  });

  it("selects IMAP/SMTP runtime adapter for password-backed methods", () => {
    const adapter = getMailboxAdapter({ db }, connection({ provider: "zoho", connection_type: "app_password" }));
    expect(adapter.key).toBe("imap_smtp");
  });

  it("rejects unsupported connection combinations", () => {
    expect(() => getMailboxAdapter({ db }, connection({ provider: "custom_inbound", connection_type: "custom_inbound" }))).toThrow(
      "No mailbox adapter supports"
    );
  });
});

describe("mailbox error classification", () => {
  it("translates generic command failures into an operator-facing mailbox validation error", () => {
    expect(classifyMailboxError(new Error("Command failed"))).toEqual({
      code: "credentials_rejected",
      message:
        "Mailbox validation failed. Verify the mailbox credentials and provider settings. If the provider uses 2FA or blocks direct password login, use an app password instead.",
    });
  });
});
