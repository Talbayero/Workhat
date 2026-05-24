jest.mock("@/lib/email/encryption", () => ({
  decryptSecret: jest.fn(() => "access-token"),
  encryptSecret: jest.fn((value: string) => `enc:${value}`),
}));

jest.mock("@/lib/email/google", () => ({
  fetchGmailMessage: jest.fn(),
  GMAIL_IMPORT_QUERY: "newer_than:30d {in:inbox to:me}",
  listGmailHistory: jest.fn(),
  listGmailInboxMessages: jest.fn(),
  refreshGmailAccessToken: jest.fn(),
  tokenExpiryDate: jest.fn(() => new Date("2026-01-01T00:00:00.000Z")),
}));

jest.mock("@/lib/email/inbound", () => ({
  processInboundEmail: jest.fn(),
}));

import { importRecentGmailInbox, markGmailSyncSuccess, type EmailConnection } from "@/lib/email/gmail-importer";
import { fetchGmailMessage, listGmailInboxMessages } from "@/lib/email/google";
import { processInboundEmail } from "@/lib/email/inbound";

type Row = Record<string, unknown>;

class QueryBuilder {
  private filters: Array<(row: Row) => boolean> = [];

  constructor(private readonly rows: Row[]) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  limit() {
    return this;
  }

  async maybeSingle() {
    return {
      data: this.rows.find((row) => this.filters.every((filter) => filter(row))) ?? null,
      error: null,
    };
  }
}

function createDb() {
  return {
    from(table: string) {
      if (table !== "channels") throw new Error(`Unexpected table ${table}`);
      return new QueryBuilder([
        {
          id: "channel-1",
          org_id: "org-1",
          provider: "gmail",
          status: "active",
          inbound_address: "support@work-hat.com",
          config_json: {},
          type: "email",
        },
      ]);
    },
  };
}

function createEmailConnectionUpdateDb() {
  const update = jest.fn(() => ({
    eq: jest.fn(async () => ({ error: null })),
  }));

  return {
    update,
    db: {
      from(table: string) {
        if (table !== "email_connections") throw new Error(`Unexpected table ${table}`);
        return { update };
      },
    },
  };
}

function connection(): EmailConnection {
  return {
    id: "connection-1",
    org_id: "org-1",
    provider_account_email: "info@work-hat.com",
    access_token_ciphertext: "enc:access-token",
    refresh_token_ciphertext: "enc:refresh-token",
    token_expires_at: "2099-01-01T00:00:00.000Z",
    last_history_id: null,
  };
}

function gmailMessage(id = "gmail-msg-1") {
  return {
    id,
    threadId: "gmail-thread-1",
    historyId: "history-1",
    internalDate: "1770000000000",
    labelIds: ["INBOX"],
    snippet: "Hello",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "Customer <customer@example.com>" },
        { name: "To", value: "Info <info@work-hat.com>" },
        { name: "Subject", value: "Question" },
        { name: "Message-ID", value: "<gmail-msg-1@example.com>" },
      ],
      body: { data: Buffer.from("Hello Work Hat").toString("base64url") },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("importRecentGmailInbox", () => {
  it("returns a transparent no-message result when Gmail returns no eligible inbox messages", async () => {
    jest.mocked(listGmailInboxMessages).mockResolvedValue({ messages: [] });

    const result = await importRecentGmailInbox({
      db: createDb() as never,
      connection: connection(),
      maxResults: 25,
    });

    expect(result).toEqual({
      imported: 0,
      skipped: 0,
      scanned: 0,
      latestHistoryId: null,
      mode: "full",
      errors: 0,
      skipReasons: {},
      errorReasons: {},
    });
    expect(processInboundEmail).not.toHaveBeenCalled();
  });

  it("counts duplicate Gmail messages as skipped instead of importing another conversation", async () => {
    jest.mocked(listGmailInboxMessages).mockResolvedValue({
      messages: [{ id: "gmail-msg-1", threadId: "gmail-thread-1" }],
    });
    jest.mocked(fetchGmailMessage).mockResolvedValue(gmailMessage() as never);
    jest.mocked(processInboundEmail).mockResolvedValue({
      duplicate: true,
      skipped: "duplicate_message",
      conversationId: "conversation-1",
      messageId: "message-1",
    } as never);

    const result = await importRecentGmailInbox({
      db: createDb() as never,
      connection: connection(),
      maxResults: 25,
    });

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.scanned).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.skipReasons).toEqual({ duplicate_message: 1 });
  });

  it("passes Gmail messages into inbound processing so inbox-readable records are created", async () => {
    jest.mocked(listGmailInboxMessages).mockResolvedValue({
      messages: [{ id: "gmail-msg-1", threadId: "gmail-thread-1" }],
    });
    jest.mocked(fetchGmailMessage).mockResolvedValue(gmailMessage() as never);
    jest.mocked(processInboundEmail).mockResolvedValue({
      duplicate: false,
      conversationId: "conversation-1",
      messageId: "message-1",
    } as never);

    const result = await importRecentGmailInbox({
      db: createDb() as never,
      connection: connection(),
      maxResults: 25,
    });

    expect(result.imported).toBe(1);
    expect(processInboundEmail).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.objectContaining({
        provider: "gmail",
        externalMessageId: "gmail-msg-1",
        externalThreadId: "gmail-thread-1",
        from: expect.objectContaining({ email: "customer@example.com" }),
        to: [expect.objectContaining({ email: "info@work-hat.com" })],
        subject: "Question",
      }),
      source: "gmail.importer",
    }));
  });

  it("persists only non-secret import summary data in provider metadata", async () => {
    const { db, update } = createEmailConnectionUpdateDb();

    await markGmailSyncSuccess({
      db: db as never,
      connectionId: "connection-1",
      existingProviderMetadata: {
        existing_safe_value: "keep",
        last_import_result: {
          subject: "Old customer subject",
          body: "Old customer body",
          access_token_ciphertext: "old-token",
          refresh_token: "old-refresh-token",
          raw_gmail_payload: { snippet: "old raw payload" },
          requestId: "old-request-id",
        },
      },
      result: {
        imported: 1,
        skipped: 2,
        scanned: 3,
        errors: 0,
        latestHistoryId: "history-1",
        mode: "full",
        skipReasons: { duplicate_message: 2 },
        errorReasons: {},
        subject: "Customer subject",
        body: "Customer body",
        access_token_ciphertext: "secret-token",
        refresh_token_ciphertext: "secret-refresh-token",
        credential_metadata: { secret: true },
        raw_gmail_payload: { snippet: "raw Gmail content" },
      } as never,
    });

    const updateCalls = update.mock.calls as unknown as Array<[{ provider_metadata: Record<string, unknown> }]>;
    const updates = updateCalls[0][0];
    const lastImportResult = updates.provider_metadata.last_import_result as Record<string, unknown>;
    const serialized = JSON.stringify(lastImportResult);

    expect(lastImportResult).toEqual({
      scanned: 3,
      imported: 1,
      skipped: 2,
      errors: 0,
      skipReasons: { duplicate_message: 2 },
      errorReasons: {},
      latestHistoryId: "history-1",
      mode: "full",
      updatedAt: expect.any(String),
    });
    expect(serialized).not.toContain("Customer subject");
    expect(serialized).not.toContain("Customer body");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("secret-refresh-token");
    expect(serialized).not.toContain("credential_metadata");
    expect(serialized).not.toContain("raw Gmail content");
    expect(serialized).not.toContain("requestId");
  });
});
