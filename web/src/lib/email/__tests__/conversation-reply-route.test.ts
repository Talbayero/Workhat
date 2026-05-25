const mockAfterWork: Array<unknown> = [];

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return {
    ...actual,
    after: jest.fn((work: unknown) => {
      mockAfterWork.push(work);
    }),
  };
});

jest.mock("@/lib/auth/app-user", () => ({
  getCurrentAppUser: jest.fn(),
}));

jest.mock("@/lib/auth/capabilities", () => ({
  requireCapability: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createOptionalAdminClient: jest.fn(),
}));

jest.mock("@/lib/email/outbound", () => ({
  sendConversationReply: jest.fn(),
}));

jest.mock("@/ai/workflows/edit-analysis", () => ({
  runEditAnalysis: jest.fn(),
}));

jest.mock("@/lib/sla/refresh", () => ({
  refreshConversationSla: jest.fn(),
}));

jest.mock("@/lib/workflow-engine", () => ({
  emitWorkflowEvent: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/conversations/[conversationId]/reply/route";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { sendConversationReply } from "@/lib/email/outbound";
import { GmailOutboundError } from "@/lib/email/gmail-sender";
import { runEditAnalysis } from "@/ai/workflows/edit-analysis";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

class RouteQueryBuilder {
  error: null = null;
  private filters: Filter[] = [];
  private insertedValue: unknown = null;

  constructor(
    private readonly db: RouteDb,
    private readonly table: string
  ) {}

  select() {
    return this;
  }

  insert(value: unknown) {
    this.insertedValue = value;
    this.db.inserts.push({ table: this.table, value });
    return this;
  }

  update(values: Record<string, unknown>) {
    this.db.updates.push({ table: this.table, values });
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
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
    if (this.table === "messages") return { data: { id: "message-1" }, error: null };
    if (this.table === "sent_replies") return { data: { id: "sent-reply-1" }, error: null };

    const row = this.insertedValue && typeof this.insertedValue === "object"
      ? { id: `${this.table}-inserted`, ...(this.insertedValue as Row) }
      : (this.db.rows[this.table] ?? []).find((candidate) => this.filters.every((filter) => filter(candidate)));
    return { data: row ?? null, error: null };
  }
}

class RouteDb {
  inserts: Array<{ table: string; value: unknown }> = [];
  updates: Array<{ table: string; values: Record<string, unknown> }> = [];

  constructor(readonly rows: Record<string, Row[]>) {}

  from(table: string) {
    return new RouteQueryBuilder(this, table);
  }
}

function createRouteDb(overrides: Record<string, Row[]> = {}) {
  return new RouteDb({
    conversations: [
      {
        id: "conversation-1",
        org_id: "org-1",
        status: "open",
      },
    ],
    ai_drafts: [
      {
        id: "draft-1",
        org_id: "org-1",
        conversation_id: "conversation-1",
        draft_text: "Original AI draft",
        context_object_id: null,
        context_object_version_id: null,
      },
    ],
    messages: [],
    sent_replies: [],
    edit_analyses: [],
    usage_events: [],
    ...overrides,
  });
}

function request(body: unknown) {
  return new NextRequest("https://work-hat.com/api/conversations/conversation-1/reply", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req-test",
    },
    body: JSON.stringify(body),
  });
}

async function callReply(body: unknown) {
  return POST(request(body), {
    params: Promise.resolve({ conversationId: "conversation-1" }),
  });
}

async function flushAfterWork() {
  const work = mockAfterWork.splice(0);
  for (const item of work) {
    if (typeof item === "function") {
      await item();
    } else {
      await item;
    }
  }
}

beforeEach(() => {
  mockAfterWork.length = 0;
  jest.clearAllMocks();
  jest.mocked(getCurrentAppUser).mockResolvedValue({
    id: "user-1",
    org_id: "org-1",
    role: "admin",
    full_name: "Agent User",
    email: "agent@example.com",
  } as never);
  jest.mocked(requireCapability).mockResolvedValue(null as never);
  jest.mocked(createOptionalAdminClient).mockReturnValue({
    client: { from: jest.fn() },
    reason: null,
  } as never);
  jest.mocked(sendConversationReply).mockResolvedValue({
    connectionId: "connection-1",
    provider: "gmail",
    providerMessageId: "gmail-sent-1",
    providerThreadId: "gmail-thread-1",
    rfcMessageId: "<workhat-test@work-hat.com>",
    sentFrom: "support@example.com",
  });
  jest.mocked(runEditAnalysis).mockResolvedValue({
    editDistanceScore: 0.2,
    changePercent: 20,
    categories: ["tone"],
    likelyReasonSummary: "Edited for tone.",
    classificationConfidence: 0.9,
    rawDiffJson: {},
    rawAnalysisJson: {},
    shouldEscalate: false,
  } as never);
});

describe("POST /api/conversations/:conversationId/reply", () => {
  it("sends through Gmail, persists outbound message and sent_reply, and queues edit analysis", async () => {
    const db = createRouteDb();
    jest.mocked(createClient).mockResolvedValue(db as never);

    const response = await callReply({ body: "Final human-approved reply", aiDraftId: "draft-1" });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      ok: true,
      requestId: "req-test",
      messageId: "message-1",
      sentReplyId: "sent-reply-1",
      analysisQueued: true,
    }));
    expect(sendConversationReply).toHaveBeenCalledWith(expect.objectContaining({
      orgId: "org-1",
      conversationId: "conversation-1",
      body: "Final human-approved reply",
      requestId: "req-test",
    }));

    const messageInsert = db.inserts.find((insert) => insert.table === "messages")?.value as Row;
    expect(messageInsert).toEqual(expect.objectContaining({
      direction: "outbound",
      channel_message_id: "gmail:gmail-sent-1",
      body_text: "Final human-approved reply",
    }));
    expect(messageInsert.metadata_json).toEqual(expect.objectContaining({
      provider: "gmail",
      provider_message_id: "gmail-sent-1",
      provider_thread_id: "gmail-thread-1",
      rfc_message_id: "<workhat-test@work-hat.com>",
      sent_from: "support@example.com",
      source_ai_draft_id: "draft-1",
    }));
    expect(JSON.stringify(messageInsert.metadata_json)).not.toContain("simulated_send");

    const sentReplyInsert = db.inserts.find((insert) => insert.table === "sent_replies")?.value as Row;
    expect(sentReplyInsert).toEqual(expect.objectContaining({
      conversation_id: "conversation-1",
      source_ai_draft_id: "draft-1",
      sent_by_user_id: "user-1",
      message_id: "message-1",
      body_text: "Final human-approved reply",
    }));

    await flushAfterWork();

    expect(runEditAnalysis).toHaveBeenCalledWith("Original AI draft", "Final human-approved reply");
    expect(db.inserts.some((insert) => insert.table === "edit_analyses")).toBe(true);
  });

  it("shows an actionable error when no active Gmail OAuth connection exists", async () => {
    const db = createRouteDb();
    jest.mocked(createClient).mockResolvedValue(db as never);
    jest.mocked(sendConversationReply).mockResolvedValue(null);

    const response = await callReply({ body: "Reply body" });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual(expect.objectContaining({
      code: "gmail_connection_missing",
      error: "Connect Gmail OAuth before sending customer replies.",
      requestId: "req-test",
    }));
  });

  it("shows an actionable error when Gmail token refresh fails", async () => {
    const db = createRouteDb();
    jest.mocked(createClient).mockResolvedValue(db as never);
    jest.mocked(sendConversationReply).mockRejectedValue(
      new GmailOutboundError("gmail_token_refresh_failed", "refresh failed")
    );

    const response = await callReply({ body: "Reply body" });
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual(expect.objectContaining({
      code: "gmail_token_refresh_failed",
      error: "Gmail connection needs to be reconnected before sending.",
      requestId: "req-test",
    }));
  });

  it("shows an actionable error when Gmail rejects the send", async () => {
    const db = createRouteDb();
    jest.mocked(createClient).mockResolvedValue(db as never);
    jest.mocked(sendConversationReply).mockRejectedValue(
      new GmailOutboundError("gmail_api_rejected", "Gmail rejected the send.")
    );

    const response = await callReply({ body: "Reply body" });
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual(expect.objectContaining({
      code: "gmail_api_rejected",
      error: "Gmail rejected the send.",
      requestId: "req-test",
    }));
  });

  it("blocks empty replies before calling Gmail", async () => {
    const db = createRouteDb();
    jest.mocked(createClient).mockResolvedValue(db as never);

    const response = await callReply({ body: "   " });
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json).toEqual(expect.objectContaining({
      code: "empty_reply",
      error: "Write a reply before sending.",
    }));
    expect(sendConversationReply).not.toHaveBeenCalled();
  });

  it("blocks closed conversations before calling Gmail", async () => {
    const db = createRouteDb({
      conversations: [{ id: "conversation-1", org_id: "org-1", status: "closed" }],
    });
    jest.mocked(createClient).mockResolvedValue(db as never);

    const response = await callReply({ body: "Reply body" });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual(expect.objectContaining({
      code: "conversation_closed",
      error: "Conversation is closed. Reopen it before sending a reply.",
    }));
    expect(sendConversationReply).not.toHaveBeenCalled();
  });
});
