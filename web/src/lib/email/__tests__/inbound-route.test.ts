jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(() => ({ from: jest.fn() })),
}));

jest.mock("@/lib/security/audit-logger", () => ({
  logAudit: jest.fn(async () => undefined),
}));

jest.mock("@/lib/email/inbound", () => ({
  extractInboundToken: jest.fn(() => "token"),
  normalizeInboundEmailPayload: jest.fn(),
  processInboundEmail: jest.fn(),
  resolveInboundChannel: jest.fn(),
  verifyInboundChannelToken: jest.fn(),
}));

import { POST } from "@/app/api/inbound/email/route";
import {
  normalizeInboundEmailPayload,
  processInboundEmail,
  resolveInboundChannel,
  verifyInboundChannelToken,
} from "@/lib/email/inbound";
import { logAudit } from "@/lib/security/audit-logger";

const normalizedMessage = {
  provider: "custom_inbound",
  externalMessageId: "msg-1",
  externalThreadId: null,
  inReplyTo: null,
  references: [],
  headers: {},
  from: { email: "customer@acme.test", name: "Customer" },
  to: [{ email: "support@workhat.test", name: "Support" }],
  cc: [],
  subject: "Help",
  textBody: "I need help",
  htmlBody: null,
  receivedAt: "2026-04-22T12:00:00.000Z",
  metadata: {},
};

const channel = {
  id: "channel-1",
  org_id: "org-1",
  provider: "custom_inbound",
  status: "active",
  inbound_address: "support@workhat.test",
  config_json: {},
};

function req(body: unknown, headers: HeadersInit = {}) {
  return {
    json: jest.fn(async () => body),
    headers: new Headers(headers),
    nextUrl: new URL("https://workhat.test/api/inbound/email?channelId=channel-1"),
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(normalizeInboundEmailPayload).mockReturnValue({ ok: true, message: normalizedMessage });
  jest.mocked(resolveInboundChannel).mockResolvedValue(channel);
  jest.mocked(verifyInboundChannelToken).mockReturnValue(true);
  jest.mocked(processInboundEmail).mockResolvedValue({
    ok: true,
    duplicate: false,
    orgId: "org-1",
    channelId: "channel-1",
    conversationId: "conversation-1",
    messageId: "message-1",
  });
});

describe("POST /api/inbound/email", () => {
  it("rejects invalid JSON", async () => {
    const response = await POST({
      json: jest.fn(async () => {
        throw new Error("bad json");
      }),
      headers: new Headers(),
      nextUrl: new URL("https://workhat.test/api/inbound/email"),
    } as never);

    expect(response.status).toBe(400);
  });

  it("rejects malformed payloads before channel processing", async () => {
    jest.mocked(normalizeInboundEmailPayload).mockReturnValue({ ok: false, error: "Message id is required." });

    const response = await POST(req({}));

    expect(response.status).toBe(422);
    expect(resolveInboundChannel).not.toHaveBeenCalled();
  });

  it("logs and rejects bad webhook tokens", async () => {
    jest.mocked(verifyInboundChannelToken).mockReturnValue(false);

    const response = await POST(req({ externalMessageId: "msg-1" }));

    expect(response.status).toBe(401);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "security.suspicious_request",
      orgId: "org-1",
      resourceId: "channel-1",
      success: false,
    }));
    expect(processInboundEmail).not.toHaveBeenCalled();
  });

  it("processes authorized inbound email and returns created", async () => {
    const response = await POST(req({ externalMessageId: "msg-1" }, { authorization: "Bearer token" }));

    expect(response.status).toBe(201);
    expect(processInboundEmail).toHaveBeenCalledWith(expect.objectContaining({
      channel,
      message: normalizedMessage,
      source: "api.inbound.email",
    }));
  });

  it("returns ok for idempotent duplicate delivery", async () => {
    jest.mocked(processInboundEmail).mockResolvedValue({
      ok: true,
      duplicate: true,
      orgId: "org-1",
      channelId: "channel-1",
      skipped: "duplicate_event",
    });

    const response = await POST(req({ externalMessageId: "msg-1" }));

    expect(response.status).toBe(200);
  });

  it("accepts unknown channels without creating cross-org side effects", async () => {
    jest.mocked(resolveInboundChannel).mockResolvedValue(null);

    const response = await POST(req({ externalMessageId: "msg-1" }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({ ok: true, skipped: "unknown_channel" });
    expect(processInboundEmail).not.toHaveBeenCalled();
  });
});

