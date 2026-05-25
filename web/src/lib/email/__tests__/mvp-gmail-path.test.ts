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
  createAdminClient: jest.fn(),
  createOptionalAdminClient: jest.fn(),
}));

jest.mock("@/lib/email/encryption", () => ({
  decryptSecret: jest.fn((value: string) => value.replace(/^enc:/, "")),
  encryptSecret: jest.fn((value: string) => `enc:${value}`),
}));

jest.mock("@/lib/email/google", () => ({
  fetchGmailMessage: jest.fn(),
  GMAIL_IMPORT_QUERY: "newer_than:30d {in:inbox to:me}",
  listGmailHistory: jest.fn(),
  listGmailInboxMessages: jest.fn(),
  refreshGmailAccessToken: jest.fn(),
  sendGmailMessage: jest.fn(),
  tokenExpiryDate: jest.fn(() => new Date("2026-01-01T00:00:00.000Z")),
}));

jest.mock("@/lib/email/inbound", () => ({
  processInboundEmail: jest.fn(),
}));

jest.mock("@/ai", () => ({
  PROMPT_VERSION: "workhat-draft-v1",
  generateDraft: jest.fn(),
}));

jest.mock("@/lib/embeddings", () => ({
  generateEmbedding: jest.fn(async () => new Array(1536).fill(0)),
}));

jest.mock("@/ai/prompts/experiments", () => ({
  assignPromptVersion: jest.fn(async () => ({
    experimentId: null,
    assignmentId: "prompt-assignment-1",
    promptVersion: "workhat-draft-v1",
    promptConfig: null,
    bucket: null,
    reason: "default",
  })),
  linkPromptAssignmentToDraft: jest.fn(async () => undefined),
}));

jest.mock("@/lib/context/context-objects", () => ({
  resolveDraftContextSelection: jest.fn(async () => null),
}));

jest.mock("@/ai/workflows/edit-analysis", () => ({
  runEditAnalysis: jest.fn(),
}));

jest.mock("@/lib/sla/refresh", () => ({
  refreshConversationSla: jest.fn(async () => undefined),
}));

jest.mock("@/lib/workflow-engine", () => ({
  emitWorkflowEvent: jest.fn(async () => undefined),
}));

import { NextRequest } from "next/server";
import { POST as syncGmail } from "@/app/api/email/gmail/sync/route";
import { POST as createAiDraft } from "@/app/api/ai/draft/route";
import { POST as sendReply } from "@/app/api/conversations/[conversationId]/reply/route";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { getConversations } from "@/lib/data/inbox";
import { fetchGmailMessage, listGmailInboxMessages, refreshGmailAccessToken, sendGmailMessage } from "@/lib/email/google";
import { processInboundEmail } from "@/lib/email/inbound";
import { createAdminClient, createOptionalAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateDraft } from "@/ai";
import { runEditAnalysis } from "@/ai/workflows/edit-analysis";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

class MvpQueryBuilder {
  private filters: Filter[] = [];
  private updateValues: Row | null = null;
  private insertedRows: Row[] | null = null;
  private limitCount: number | null = null;
  private selectOptions: { count?: string; head?: boolean } | null = null;

  constructor(
    private readonly db: MvpDb,
    private readonly table: string
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.selectOptions = options ?? null;
    return this;
  }

  insert(value: Row | Row[]) {
    const values = Array.isArray(value) ? value : [value];
    this.insertedRows = values.map((row) => ({
      id: typeof row.id === "string" ? row.id : this.db.nextId(this.table, row),
      ...row,
    }));
    this.db.rows[this.table] ??= [];
    this.db.rows[this.table].push(...this.insertedRows);
    this.db.inserts.push(...this.insertedRows.map((row) => ({ table: this.table, value: row })));
    return this;
  }

  update(values: Row) {
    this.updateValues = values;
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

  gte(column: string, value: unknown) {
    this.filters.push((row) => String(row[column] ?? "") >= String(value));
    return this;
  }

  textSearch() {
    return this;
  }

  order() {
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  private matchingRows() {
    const rows = this.db.rows[this.table] ?? [];
    const filtered = rows.filter((row) => this.filters.every((filter) => filter(row)));
    return this.limitCount === null ? filtered : filtered.slice(0, this.limitCount);
  }

  private applyUpdate() {
    if (!this.updateValues) return;
    for (const row of this.matchingRows()) {
      Object.assign(row, this.updateValues);
      this.db.updates.push({ table: this.table, values: this.updateValues });
    }
    this.updateValues = null;
  }

  async maybeSingle() {
    this.applyUpdate();
    return { data: this.matchingRows()[0] ?? null, error: null };
  }

  async single() {
    this.applyUpdate();
    return { data: this.insertedRows?.[0] ?? this.matchingRows()[0] ?? null, error: null };
  }

  then(
    resolve: (value: { data: Row[]; error: null; count?: number }) => unknown,
    reject: (reason?: unknown) => unknown
  ) {
    this.applyUpdate();
    const rows = this.matchingRows();
    const result = {
      data: this.selectOptions?.head ? [] : rows,
      error: null,
      count: this.selectOptions?.count ? rows.length : undefined,
    };
    return Promise.resolve(result).then(resolve, reject);
  }
}

class MvpDb {
  inserts: Array<{ table: string; value: Row }> = [];
  updates: Array<{ table: string; values: Row }> = [];

  rows: Record<string, Row[]> = {
    users: [{ id: "user-1", auth_user_id: "auth-user-1", org_id: "org-1", role: "admin", full_name: "Agent User" }],
    organizations: [{ id: "org-1", name: "Work Hat", slug: "work-hat", ai_plan: "starter" }],
    channels: [{
      id: "channel-1",
      org_id: "org-1",
      type: "email",
      provider: "gmail",
      status: "active",
      inbound_address: "support@work-hat.com",
      config_json: {},
    }],
    email_connections: [{
      id: "connection-1",
      org_id: "org-1",
      provider: "gmail",
      connection_type: "oauth",
      provider_account_email: "support@work-hat.com",
      display_name: "Support Gmail",
      status: "active",
      sync_status: "idle",
      access_token_ciphertext: "enc:access-token",
      refresh_token_ciphertext: "enc:refresh-token",
      token_expires_at: "2099-01-01T00:00:00.000Z",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
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
      diagnostics_json: null,
      credential_metadata: null,
      provider_metadata: {},
      updated_at: "2026-01-01T00:00:00.000Z",
    }],
    contacts: [],
    companies: [],
    conversations: [],
    messages: [],
    knowledge_entries: [],
    knowledge_chunks: [],
    ai_drafts: [],
    sent_replies: [],
    edit_analyses: [],
    usage_events: [],
    inbound_email_events: [],
  };

  auth = {
    getUser: jest.fn(async () => ({
      data: { user: { id: "auth-user-1", email: "agent@work-hat.com" } },
    })),
  };

  from(table: string) {
    return new MvpQueryBuilder(this, table);
  }

  async rpc() {
    return { data: [], error: null };
  }

  nextId(table: string, row: Row) {
    if (table === "ai_drafts") return "draft-1";
    if (table === "messages" && row.direction === "outbound") return "message-outbound-1";
    if (table === "sent_replies") return "sent-reply-1";
    if (table === "edit_analyses") return "edit-analysis-1";
    if (table === "usage_events") return `usage-${this.rows.usage_events.length + 1}`;
    return `${table}-${(this.rows[table]?.length ?? 0) + 1}`;
  }
}

function gmailMessage() {
  return {
    id: "gmail-message-1",
    threadId: "gmail-thread-1",
    historyId: "history-1",
    internalDate: "1770000000000",
    labelIds: ["INBOX"],
    snippet: "Need help with our account",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "Customer One <customer@example.com>" },
        { name: "To", value: "Support <support@work-hat.com>" },
        { name: "Subject", value: "Need help with our account" },
        { name: "Message-ID", value: "<gmail-message-1@example.com>" },
      ],
      body: { data: Buffer.from("Hello Work Hat, can you help with our account?").toString("base64url") },
    },
  };
}

function req(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "req-mvp" },
    body: body === undefined ? undefined : JSON.stringify(body),
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

describe("Gmail-only MVP path proof", () => {
  beforeEach(() => {
    mockAfterWork.length = 0;
    jest.clearAllMocks();
    jest.mocked(getCurrentAppUser).mockResolvedValue({
      id: "user-1",
      org_id: "org-1",
      role: "admin",
      full_name: "Agent User",
      email: "agent@work-hat.com",
    } as never);
    jest.mocked(requireCapability).mockResolvedValue(null as never);
    jest.mocked(listGmailInboxMessages).mockResolvedValue({
      messages: [{ id: "gmail-message-1", threadId: "gmail-thread-1" }],
    });
    jest.mocked(fetchGmailMessage).mockResolvedValue(gmailMessage() as never);
    jest.mocked(generateDraft).mockResolvedValue({
      draftText: "Thanks for reaching out. I can help with your account.",
      rationale: "Answer the latest customer question directly.",
      confidenceLevel: "high",
      riskFlags: [],
      missingContext: [],
      recommendedTags: ["support"],
      provider: "openai",
      model: "gpt-4o",
      promptVersion: "workhat-draft-v1",
      requestTokens: 100,
      responseTokens: 40,
      latencyMs: 250,
    } as never);
    jest.mocked(sendGmailMessage).mockResolvedValue({
      id: "gmail-sent-1",
      threadId: "gmail-thread-1",
    });
    jest.mocked(runEditAnalysis).mockResolvedValue({
      editDistanceScore: 0.1,
      changePercent: 10,
      categories: ["clarity"],
      likelyReasonSummary: "Human shortened the AI draft.",
      classificationConfidence: 0.95,
      rawDiffJson: {},
      rawAnalysisJson: {},
      shouldEscalate: false,
    } as never);
  });

  it("imports Gmail, shows the inbox thread, drafts, sends through Gmail, and records edit-analysis evidence", async () => {
    const db = new MvpDb();
    jest.mocked(createClient).mockResolvedValue(db as never);
    jest.mocked(createAdminClient).mockReturnValue(db as never);
    jest.mocked(createOptionalAdminClient).mockReturnValue({ client: db, reason: null } as never);
    jest.mocked(processInboundEmail).mockImplementation(async ({ message }) => {
      const contact = {
        id: "contact-1",
        org_id: "org-1",
        full_name: message.from.name,
        email: message.from.email,
        phone: "",
        tier: "",
        notes: "",
        tags: [],
      };
      const company = { id: "company-1", org_id: "org-1", name: "Customer Co" };
      const conversation = {
        id: "conversation-1",
        org_id: "org-1",
        subject: message.subject,
        status: "open",
        priority: "normal",
        contact_id: "contact-1",
        company_id: "company-1",
        channel_id: "channel-1",
        assigned_to_name: "",
        assigned_user_id: null,
        risk_level: null,
        ai_confidence: null,
        preview: message.textBody,
        intent: null,
        tags: [],
        last_message_at: message.receivedAt,
        sla_status: "on_track",
        sla_target: "first_response",
        sla_due_at: null,
        sla_breached_at: null,
        sla_last_evaluated_at: message.receivedAt,
        contacts: contact,
        companies: company,
        channels: { type: "email" },
      };
      const inboundMessage = {
        id: "message-inbound-1",
        org_id: "org-1",
        conversation_id: "conversation-1",
        sender_type: "customer",
        author_name: message.from.name,
        direction: "inbound",
        channel_message_id: "gmail:gmail-message-1",
        body_text: message.textBody,
        is_note: false,
        created_at: message.receivedAt,
        metadata_json: {
          gmail_thread_id: message.externalThreadId,
          rfc_message_id: message.metadata.rfc_message_id,
        },
      };

      db.rows.contacts.push(contact);
      db.rows.companies.push(company);
      db.rows.conversations.push(conversation);
      db.rows.messages.push(inboundMessage);
      db.rows.inbound_email_events.push({
        id: "event-1",
        org_id: "org-1",
        channel_id: "channel-1",
        external_message_id: "gmail-message-1",
        conversation_id: "conversation-1",
        message_id: "message-inbound-1",
      });

      return { duplicate: false, orgId: "org-1", channelId: "channel-1", conversationId: "conversation-1", messageId: "message-inbound-1" } as never;
    });

    const importResponse = await syncGmail(req("https://work-hat.com/api/email/gmail/sync"));
    const importJson = await importResponse.json();

    expect(importResponse.status).toBe(200);
    expect(importJson).toEqual(expect.objectContaining({
      ok: true,
      requestId: "req-mvp",
      scanned: 1,
      imported: 1,
      skipped: 0,
    }));
    expect(processInboundEmail).toHaveBeenCalledWith(expect.objectContaining({
      source: "gmail.importer",
      message: expect.objectContaining({
        provider: "gmail",
        externalMessageId: "gmail-message-1",
        externalThreadId: "gmail-thread-1",
      }),
    }));

    const inbox = await getConversations();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      id: "conversation-1",
      subject: "Need help with our account",
      preview: "Hello Work Hat, can you help with our account?",
      channel: "email",
    });

    const draftResponse = await createAiDraft(req("https://work-hat.com/api/ai/draft", {
      conversationId: "conversation-1",
      sourceMessageId: "message-inbound-1",
    }));
    const draftJson = await draftResponse.json();
    await flushAfterWork();

    expect(draftResponse.status).toBe(200);
    expect(draftJson.draft).toEqual(expect.objectContaining({
      id: "draft-1",
      draftText: "Thanks for reaching out. I can help with your account.",
      promptVersion: "workhat-draft-v1",
    }));
    expect(db.rows.ai_drafts).toHaveLength(1);

    const finalHumanReply = "Thanks for reaching out. I checked your account and can help.";
    const replyResponse = await sendReply(req("https://work-hat.com/api/conversations/conversation-1/reply", {
      body: finalHumanReply,
      aiDraftId: draftJson.draft.id,
    }), {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });
    const replyJson = await replyResponse.json();
    await flushAfterWork();

    expect(replyResponse.status).toBe(200);
    expect(replyJson).toEqual(expect.objectContaining({
      ok: true,
      requestId: "req-mvp",
      messageId: "message-outbound-1",
      sentReplyId: "sent-reply-1",
      analysisQueued: true,
    }));
    expect(sendGmailMessage).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "access-token",
      threadId: "gmail-thread-1",
      raw: expect.any(String),
    }));

    const outboundMessage = db.rows.messages.find((message) => message.id === "message-outbound-1");
    expect(outboundMessage).toEqual(expect.objectContaining({
      direction: "outbound",
      channel_message_id: "gmail:gmail-sent-1",
      body_text: finalHumanReply,
    }));
    expect(JSON.stringify(outboundMessage?.metadata_json)).not.toContain("simulated_send");

    expect(db.rows.sent_replies).toContainEqual(expect.objectContaining({
      id: "sent-reply-1",
      conversation_id: "conversation-1",
      source_ai_draft_id: "draft-1",
      body_text: finalHumanReply,
    }));
    expect(db.rows.edit_analyses).toContainEqual(expect.objectContaining({
      id: "edit-analysis-1",
      conversation_id: "conversation-1",
      ai_draft_id: "draft-1",
      sent_reply_id: "sent-reply-1",
      likely_reason_summary: "Human shortened the AI draft.",
    }));
  });

  it("returns an actionable Gmail import error when no active OAuth connection exists", async () => {
    const db = new MvpDb();
    db.rows.email_connections = [];
    jest.mocked(createClient).mockResolvedValue(db as never);
    jest.mocked(createAdminClient).mockReturnValue(db as never);

    const response = await syncGmail(req("https://work-hat.com/api/email/gmail/sync"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual(expect.objectContaining({
      code: "gmail_connection_missing",
      error: "No active Gmail OAuth connection is available. Connect Gmail in Settings -> Channels, then import latest email.",
      requestId: "req-mvp",
    }));
    expect(listGmailInboxMessages).not.toHaveBeenCalled();
  });

  it("returns an actionable Gmail import error when token refresh fails", async () => {
    const db = new MvpDb();
    db.rows.email_connections[0].token_expires_at = "2020-01-01T00:00:00.000Z";
    jest.mocked(createClient).mockResolvedValue(db as never);
    jest.mocked(createAdminClient).mockReturnValue(db as never);
    jest.mocked(refreshGmailAccessToken).mockRejectedValue(new Error("Google token refresh failed: invalid_grant"));

    const response = await syncGmail(req("https://work-hat.com/api/email/gmail/sync"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual(expect.objectContaining({
      code: "gmail_token_refresh_failed",
      error: "Gmail connection needs to be reconnected before importing mail.",
      requestId: "req-mvp",
    }));
    expect(listGmailInboxMessages).not.toHaveBeenCalled();
  });
});
