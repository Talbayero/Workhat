jest.mock("@/lib/auth/app-user", () => ({
  getCurrentAppUser: jest.fn(),
}));

jest.mock("@/lib/auth/capabilities", () => ({
  requireCapability: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/email/mvp-smoke-check", () => ({
  runGmailMvpSmokeCheck: jest.fn(),
}));

import { POST as runMvpSmokeCheck } from "@/app/api/system/mvp-smoke-check/route";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { runGmailMvpSmokeCheck as runSmokeCheckRuntime } from "@/lib/email/mvp-smoke-check";
import { createAdminClient } from "@/lib/supabase/admin";

describe("POST /api/system/mvp-smoke-check", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getCurrentAppUser).mockResolvedValue({
      id: "user-1",
      org_id: "org-1",
      role: "admin",
    } as never);
    jest.mocked(requireCapability).mockResolvedValue(null as never);
    jest.mocked(createAdminClient).mockReturnValue({ from: jest.fn() } as never);
  });

  it("runs the Gmail-only MVP smoke check for admins without exposing token fields", async () => {
    jest.mocked(runSmokeCheckRuntime).mockResolvedValue({
      ok: true,
      requestId: "req-test",
      orgId: "org-1",
      emailConnectionId: "connection-1",
      connectedMailbox: "info@work-hat.com",
      importRoute: "/api/email/gmail/sync",
      importQuery: "newer_than:30d {in:inbox to:me}",
      latestImportResult: {
        scanned: 1,
        imported: 1,
        skipped: 0,
        errors: 0,
      },
      counts: {
        inboxVisibleConversations: 1,
        gmailImportedMessages: 1,
        gmailImportedConversations: 1,
        visibleImportedConversations: 1,
      },
      checks: [
        {
          key: "gmail_active",
          label: "Gmail OAuth active",
          status: "pass",
          message: "Active Gmail OAuth connection found.",
        },
      ],
    } as never);

    const response = await runMvpSmokeCheck(new Request("https://work-hat.com/api/system/mvp-smoke-check", {
      method: "POST",
      headers: { "x-request-id": "req-test" },
    }) as never);
    const body = await response.json();
    const bodyText = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(requireCapability).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: "org-1" }),
      "settings.manage",
      "system/mvp-smoke-check",
      expect.anything()
    );
    expect(runSmokeCheckRuntime).toHaveBeenCalledWith(expect.objectContaining({
      orgId: "org-1",
      requestId: "req-test",
    }));
    expect(body.ok).toBe(true);
    expect(body.importRoute).toBe("/api/email/gmail/sync");
    expect(bodyText).not.toContain("access_token_ciphertext");
    expect(bodyText).not.toContain("refresh_token_ciphertext");
  });

  it("returns 409 when the smoke check finds an MVP readiness gap", async () => {
    jest.mocked(runSmokeCheckRuntime).mockResolvedValue({
      ok: false,
      orgId: "org-1",
      emailConnectionId: null,
      connectedMailbox: null,
      importRoute: "/api/email/gmail/sync",
      importQuery: "newer_than:30d {in:inbox to:me}",
      latestImportResult: null,
      counts: {
        inboxVisibleConversations: 0,
        gmailImportedMessages: 0,
        gmailImportedConversations: 0,
        visibleImportedConversations: 0,
      },
      checks: [
        {
          key: "gmail_active",
          label: "Gmail OAuth active",
          status: "fail",
          message: "No active Gmail OAuth connection exists.",
        },
      ],
    } as never);

    const response = await runMvpSmokeCheck(new Request("https://work-hat.com/api/system/mvp-smoke-check", {
      method: "POST",
    }) as never);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.checks[0].status).toBe("fail");
  });
});
