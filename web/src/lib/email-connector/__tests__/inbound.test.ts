jest.mock("@/lib/ai/intent-classifier", () => ({
  classifyIntent: jest.fn(async () => "support"),
  routeBySkill: jest.fn(async () => null),
}));

jest.mock("@/lib/sla/refresh", () => ({
  refreshConversationSla: jest.fn(async () => undefined),
}));

jest.mock("@/lib/workflow-engine", () => ({
  emitWorkflowEvent: jest.fn(async () => undefined),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import {
  extractInboundToken,
  normalizeInboundEmailPayload,
  processInboundEmail,
  verifyInboundChannelToken,
  type InboundChannel,
  type NormalizedInboundEmail,
} from "@/lib/email-connector/inbound";
import { refreshConversationSla } from "@/lib/sla/refresh";
import { emitWorkflowEvent } from "@/lib/workflow-engine";
import { hashInboundWebhookSecret } from "@/lib/email-connector/webhook-secret";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const orgId = "org-1";
const channelId = "channel-1";

function match(row: Row, filters: Array<(row: Row) => boolean>) {
  return filters.every((filter) => filter(row));
}

class QueryBuilder {
  private filters: Array<(row: Row) => boolean> = [];
  private pendingInsert: Row[] | null = null;
  private pendingUpdate: Row | null = null;
  private selected = "";

  constructor(private tables: Tables, private table: string) {}

  select(columns?: string) {
    this.selected = columns ?? "";
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

  ilike(column: string, value: string) {
    this.filters.push((row) => String(row[column] ?? "").toLowerCase() === value.toLowerCase());
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  limit() {
    return this;
  }

  order() {
    return this;
  }

  insert(value: Row | Row[]) {
    this.pendingInsert = Array.isArray(value) ? value : [value];
    return this;
  }

  update(value: Row) {
    this.pendingUpdate = value;
    return this;
  }

  async maybeSingle() {
    if (this.pendingUpdate) {
      const row = this.rows().find((candidate) => match(candidate, this.filters));
      if (row) Object.assign(row, this.pendingUpdate);
      return { data: row ?? null, error: null };
    }

    const row = this.rows().find((candidate) => match(candidate, this.filters)) ?? null;
    return { data: row, error: null };
  }

  async single() {
    if (this.pendingInsert) {
      const inserted: Row[] = [];
      for (const value of this.pendingInsert) {
        if (this.table === "inbound_email_events") {
          const duplicate = this.rows().some((row) => row.dedupe_key === value.dedupe_key);
          if (duplicate) return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const row = { id: value.id ?? `${this.table}-${this.rows().length + 1}`, ...value };
        this.rows().push(row);
        inserted.push(row);
      }
      return { data: this.project(inserted[0]), error: null };
    }

    if (this.pendingUpdate) {
      const row = this.rows().find((candidate) => match(candidate, this.filters));
      if (row) Object.assign(row, this.pendingUpdate);
      return { data: this.project(row ?? null), error: null };
    }

    const row = this.rows().find((candidate) => match(candidate, this.filters)) ?? null;
    return { data: this.project(row), error: null };
  }

  then(resolve: (value: { data: Row[]; error: null }) => unknown, reject: (reason?: unknown) => unknown) {
    if (this.pendingUpdate) {
      const rows = this.rows().filter((candidate) => match(candidate, this.filters));
      for (const row of rows) Object.assign(row, this.pendingUpdate);
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    }

    const rows = this.rows().filter((candidate) => match(candidate, this.filters)).map((row) => this.project(row) as Row);
    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  }

  private rows() {
    this.tables[this.table] ??= [];
    return this.tables[this.table];
  }

  private project(row: Row | null) {
    if (!row || !this.selected) return row;
    if (this.selected === "id") return { id: row.id };
    if (this.selected === "conversation_id") return { conversation_id: row.conversation_id };
    return row;
  }
}

function createDb(seed: Partial<Tables> = {}) {
  const tables: Tables = {
    contacts: [],
    companies: [],
    conversations: [],
    messages: [],
    inbound_email_events: [],
    channels: [],
    intents: [],
    users: [],
    ...seed,
  };

  return {
    tables,
    db: {
      from(table: string) {
        return new QueryBuilder(tables, table);
      },
    },
  };
}

function channel(overrides: Partial<InboundChannel> = {}): InboundChannel {
  return {
    id: channelId,
    org_id: orgId,
    provider: "custom_inbound",
    status: "active",
    inbound_address: "support@workhat.test",
    config_json: {},
    ...overrides,
  };
}

function message(overrides: Partial<NormalizedInboundEmail> = {}): NormalizedInboundEmail {
  return {
    provider: "custom_inbound",
    externalMessageId: "msg-1",
    externalThreadId: null,
    inReplyTo: null,
    references: [],
    headers: {},
    from: { email: "customer@acme.test", name: "Customer One" },
    to: [{ email: "support@workhat.test", name: "Support" }],
    cc: [],
    subject: "Urgent billing problem",
    textBody: "This is urgent and not working.",
    htmlBody: null,
    receivedAt: "2026-04-22T12:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.POSTMARK_INBOUND_TOKEN;
});

describe("normalizeInboundEmailPayload", () => {
  it("normalizes generic inbound payloads", () => {
    const result = normalizeInboundEmailPayload({
      provider: "internal relay",
      externalMessageId: "abc-123",
      from: { email: "User@Example.com", name: "User Example" },
      to: [{ email: "support@workhat.test" }],
      subject: "Hello",
      textBody: "Hi there",
      receivedAt: "2026-04-22T10:00:00Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.provider).toBe("internal_relay");
      expect(result.message.from.email).toBe("user@example.com");
      expect(result.message.to[0].email).toBe("support@workhat.test");
    }
  });

  it("normalizes Postmark-compatible payloads", () => {
    const result = normalizeInboundEmailPayload({
      MessageID: "postmark-1",
      FromFull: { Email: "sender@acme.test", Name: "Sender" },
      ToFull: [{ Email: "support@workhat.test", Name: "Support" }],
      Subject: "Reply",
      TextBody: "Reply body",
      Headers: [{ Name: "In-Reply-To", Value: "<prior@example.test>" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.externalMessageId).toBe("postmark-1");
      expect(result.message.inReplyTo).toBe("<prior@example.test>");
    }
  });

  it("rejects malformed payloads", () => {
    const result = normalizeInboundEmailPayload({ from: "nobody@example.com" });
    expect(result).toEqual({ ok: false, error: "Message id is required." });
  });
});

describe("webhook token helpers", () => {
  it("extracts bearer or explicit inbound tokens", () => {
    expect(extractInboundToken(new Headers({ authorization: "Bearer secret-1" }))).toBe("secret-1");
    expect(extractInboundToken(new Headers({ "x-workhat-inbound-token": "secret-2" }))).toBe("secret-2");
  });

  it("verifies hashed per-channel webhook tokens without encryption env", () => {
    delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    const inboundChannel = channel({
      config_json: {
        webhook_secret_hash: hashInboundWebhookSecret("channel-token"),
      },
    });

    expect(verifyInboundChannelToken(inboundChannel, "channel-token")).toBe(true);
    expect(verifyInboundChannelToken(inboundChannel, "wrong")).toBe(false);
  });

  it("supports legacy shared token only when the channel has no per-channel secret", () => {
    process.env.POSTMARK_INBOUND_TOKEN = "legacy-token";
    expect(verifyInboundChannelToken(channel(), "legacy-token")).toBe(true);
    expect(verifyInboundChannelToken(channel(), "wrong")).toBe(false);
  });
});

describe("processInboundEmail", () => {
  it("creates contact, company, conversation, message, SLA refresh, and workflow events", async () => {
    const { db, tables } = createDb();

    const result = await processInboundEmail({
      db: db as never,
      channel: channel(),
      message: message(),
      source: "test",
    });

    expect(result.duplicate).toBe(false);
    expect(tables.contacts).toHaveLength(1);
    expect(tables.companies).toHaveLength(1);
    expect(tables.conversations).toHaveLength(1);
    expect(tables.messages).toHaveLength(1);
    expect(tables.inbound_email_events[0].status).toBe("processed");
    expect(refreshConversationSla).toHaveBeenCalledTimes(1);
    expect(emitWorkflowEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "conversation.created" }));
    expect(emitWorkflowEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "message.received" }));
    expect(tables.conversations[0].org_id).toBe(orgId);
    expect(tables.messages[0].org_id).toBe(orgId);
  });

  it("returns duplicate without emitting downstream events when a message already exists", async () => {
    const { db } = createDb({
      messages: [{ id: "message-existing", org_id: orgId, channel_message_id: "custom_inbound:msg-1", conversation_id: "conversation-existing" }],
    });

    const result = await processInboundEmail({
      db: db as never,
      channel: channel(),
      message: message(),
    });

    expect(result.duplicate).toBe(true);
    expect(result.skipped).toBe("duplicate_message");
    expect(refreshConversationSla).not.toHaveBeenCalled();
    expect(emitWorkflowEvent).not.toHaveBeenCalled();
  });

  it("threads into an existing conversation and emits update plus risk change once", async () => {
    const { db, tables } = createDb({
      conversations: [
        {
          id: "conversation-existing",
          org_id: orgId,
          external_thread_id: "custom_inbound:thread-1",
          risk_level: "yellow",
          status: "open",
        },
      ],
    });

    const result = await processInboundEmail({
      db: db as never,
      channel: channel(),
      message: message({ externalThreadId: "thread-1", externalMessageId: "msg-2" }),
    });

    expect(result.duplicate).toBe(false);
    expect(tables.conversations).toHaveLength(1);
    expect(tables.messages[0].conversation_id).toBe("conversation-existing");
    expect(emitWorkflowEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "conversation.updated" }));
    expect(emitWorkflowEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "message.received" }));
    expect(emitWorkflowEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "risk.changed" }));
    expect(emitWorkflowEvent).toHaveBeenCalledTimes(3);
  });

  it("treats duplicate event inserts as idempotent replay", async () => {
    const { db } = createDb({
      inbound_email_events: [
        {
          id: "event-existing",
          org_id: orgId,
          channel_id: channelId,
          dedupe_key: "channel-1:custom_inbound:msg-1",
          status: "processed",
        },
      ],
    });

    const result = await processInboundEmail({
      db: db as never,
      channel: channel(),
      message: message(),
    });

    expect(result.duplicate).toBe(true);
    expect(result.skipped).toBe("duplicate_event");
    expect(emitWorkflowEvent).not.toHaveBeenCalled();
  });
});
