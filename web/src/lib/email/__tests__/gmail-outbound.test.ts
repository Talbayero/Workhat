jest.mock("@/lib/email/encryption", () => ({
  decryptSecret: jest.fn((value: string) => value.replace(/^enc:/, "")),
  encryptSecret: jest.fn((value: string) => `enc:${value}`),
}));

jest.mock("@/lib/email/google", () => ({
  refreshGmailAccessToken: jest.fn(),
  sendGmailMessage: jest.fn(),
  tokenExpiryDate: jest.fn(() => new Date("2026-01-01T00:00:00.000Z")),
}));

import { sendConversationReplyWithGmail, GmailOutboundError } from "@/lib/email/gmail-sender";
import { sendConversationReply } from "@/lib/email/outbound";
import { refreshGmailAccessToken, sendGmailMessage } from "@/lib/email/google";
import type { EmailConnection } from "@/lib/email/gmail-importer";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

class QueryBuilder {
  error: null = null;
  private filters: Filter[] = [];
  private insertedValue: unknown = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string
  ) {}

  select() {
    return this;
  }

  update(values: Record<string, unknown>) {
    this.db.updates.push({ table: this.table, values });
    return this;
  }

  insert(value: unknown) {
    this.insertedValue = value;
    this.db.inserts.push({ table: this.table, value });
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  async maybeSingle() {
    const row = (this.db.rows[this.table] ?? []).find((candidate) =>
      this.filters.every((filter) => filter(candidate))
    );
    return { data: row ?? null, error: null };
  }

  async single() {
    const rows = this.db.rows[this.table] ?? [];
    const row = this.insertedValue && typeof this.insertedValue === "object"
      ? { id: `${this.table}-inserted`, ...(this.insertedValue as Row) }
      : rows.find((candidate) => this.filters.every((filter) => filter(candidate)));
    return { data: row ?? null, error: null };
  }
}

class FakeDb {
  updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  inserts: Array<{ table: string; value: unknown }> = [];

  constructor(readonly rows: Record<string, Row[]>) {}

  from(table: string) {
    return new QueryBuilder(this, table);
  }
}

function connection(overrides: Partial<EmailConnection> = {}): EmailConnection {
  return {
    id: "connection-1",
    org_id: "org-1",
    provider_account_email: "support@example.com",
    access_token_ciphertext: "enc:access-token",
    refresh_token_ciphertext: "enc:refresh-token",
    token_expires_at: "2099-01-01T00:00:00.000Z",
    last_history_id: null,
    ...overrides,
  };
}

function createDb(overrides: Record<string, Row[]> = {}) {
  return new FakeDb({
    conversations: [
      {
        id: "conversation-1",
        org_id: "org-1",
        subject: "Customer question",
        contacts: { email: "customer@example.com" },
      },
    ],
    messages: [
      {
        id: "message-inbound-1",
        org_id: "org-1",
        conversation_id: "conversation-1",
        direction: "inbound",
        created_at: "2026-01-01T00:00:00.000Z",
        metadata_json: {
          gmail_thread_id: "gmail-thread-1",
          rfc_message_id: "<incoming@example.com>",
        },
      },
    ],
    email_connections: [
      {
        ...connection(),
        provider: "gmail",
        connection_type: "oauth",
        status: "active",
        outbound_enabled: true,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(sendGmailMessage).mockResolvedValue({
    id: "gmail-sent-1",
    threadId: "gmail-thread-1",
  });
  jest.mocked(refreshGmailAccessToken).mockResolvedValue({
    access_token: "new-access-token",
    expires_in: 3600,
    scope: "https://www.googleapis.com/auth/gmail.send",
    token_type: "Bearer",
  });
});

describe("Gmail outbound replies", () => {
  it("sends through Gmail with the selected OAuth connection and records provider IDs", async () => {
    const db = createDb();

    const result = await sendConversationReplyWithGmail({
      db: db as never,
      orgId: "org-1",
      conversationId: "conversation-1",
      body: "Thanks for reaching out.",
      connection: connection(),
      requestId: "req-test",
    });

    expect(result).toEqual({
      connectionId: "connection-1",
      provider: "gmail",
      providerMessageId: "gmail-sent-1",
      providerThreadId: "gmail-thread-1",
      rfcMessageId: expect.stringMatching(/^<workhat-/),
      sentFrom: "support@example.com",
    });
    expect(sendGmailMessage).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "access-token",
      threadId: "gmail-thread-1",
      raw: expect.any(String),
    }));
    expect(db.updates).toContainEqual({
      table: "email_connections",
      values: expect.objectContaining({
        last_outbound_send_at: expect.any(String),
        last_error_code: null,
        last_error_message: null,
      }),
    });
  });

  it("refreshes expired Gmail tokens before sending", async () => {
    const db = createDb();

    await sendConversationReplyWithGmail({
      db: db as never,
      orgId: "org-1",
      conversationId: "conversation-1",
      body: "Reply body",
      connection: connection({ token_expires_at: "2020-01-01T00:00:00.000Z" }),
    });

    expect(refreshGmailAccessToken).toHaveBeenCalledWith("refresh-token");
    expect(sendGmailMessage).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "new-access-token",
    }));
    expect(db.updates).toContainEqual({
      table: "email_connections",
      values: expect.objectContaining({
        access_token_ciphertext: "enc:new-access-token",
        token_expires_at: "2026-01-01T00:00:00.000Z",
        scopes: ["https://www.googleapis.com/auth/gmail.send"],
      }),
    });
  });

  it("returns a typed error when token refresh fails", async () => {
    const db = createDb();
    jest.mocked(refreshGmailAccessToken).mockRejectedValue(new Error("Google token refresh failed: invalid_grant"));

    await expect(sendConversationReplyWithGmail({
      db: db as never,
      orgId: "org-1",
      conversationId: "conversation-1",
      body: "Reply body",
      connection: connection({ token_expires_at: "2020-01-01T00:00:00.000Z" }),
    })).rejects.toMatchObject({
      name: "GmailOutboundError",
      code: "gmail_token_refresh_failed",
    } satisfies Partial<GmailOutboundError>);

    expect(sendGmailMessage).not.toHaveBeenCalled();
    expect(db.updates).toContainEqual({
      table: "email_connections",
      values: expect.objectContaining({
        status: "error",
        last_error_code: "token_refresh_failed",
      }),
    });
  });

  it("returns a typed error when Gmail rejects the send", async () => {
    const db = createDb();
    jest.mocked(sendGmailMessage).mockRejectedValue(new Error("Gmail send failed: 403"));

    await expect(sendConversationReplyWithGmail({
      db: db as never,
      orgId: "org-1",
      conversationId: "conversation-1",
      body: "Reply body",
      connection: connection(),
    })).rejects.toMatchObject({
      name: "GmailOutboundError",
      code: "gmail_api_rejected",
    } satisfies Partial<GmailOutboundError>);

    expect(db.updates).toContainEqual({
      table: "email_connections",
      values: expect.objectContaining({
        last_error_code: "send_failed",
      }),
    });
  });

  it("does not fall back to non-Gmail or inactive mailbox sending", async () => {
    const db = createDb({ email_connections: [] });

    const result = await sendConversationReply({
      db: db as never,
      orgId: "org-1",
      conversationId: "conversation-1",
      body: "Reply body",
    });

    expect(result).toBeNull();
    expect(sendGmailMessage).not.toHaveBeenCalled();
  });
});
