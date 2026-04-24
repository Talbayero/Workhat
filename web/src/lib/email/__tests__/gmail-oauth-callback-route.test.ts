jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/auth/app-user", () => ({
  getCurrentAppUser: jest.fn(),
}));

jest.mock("@/lib/auth/capabilities", () => ({
  hasCapability: jest.fn(),
}));

jest.mock("@/lib/email/encryption", () => ({
  encryptSecret: jest.fn((value: string) => `enc:${value}`),
}));

jest.mock("@/lib/email/google", () => ({
  GMAIL_PROVIDER: "gmail",
  exchangeGmailCode: jest.fn(),
  fetchGmailProfile: jest.fn(),
  getGoogleRedirectUri: jest.fn(() => "https://work-hat.com/api/oauth/google/callback"),
  tokenExpiryDate: jest.fn(() => new Date("2026-01-01T00:00:00.000Z")),
  watchGmailInbox: jest.fn(),
}));

jest.mock("@/lib/email/gmail-importer", () => ({
  importRecentGmailInbox: jest.fn(async () => ({ imported: 1, skipped: 0, scanned: 1, latestHistoryId: "history-1", mode: "full" })),
  markGmailSyncSuccess: jest.fn(),
}));

jest.mock("@/lib/security/audit-logger", () => ({
  logAudit: jest.fn(),
}));

import { GET as googleOAuthCallback } from "@/app/api/oauth/google/callback/route";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { hasCapability } from "@/lib/auth/capabilities";
import { importRecentGmailInbox, markGmailSyncSuccess } from "@/lib/email/gmail-importer";
import { exchangeGmailCode, fetchGmailProfile } from "@/lib/email/google";
import { logAudit } from "@/lib/security/audit-logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function encodeState(input: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function req(url: string, cookies: Record<string, string>) {
  return {
    nextUrl: new URL(url),
    url,
    cookies: {
      get: jest.fn((name: string) => (cookies[name] ? { value: cookies[name] } : undefined)),
    },
  } as never;
}

describe("GET /api/oauth/google/callback", () => {
  beforeEach(() => {
    jest.mocked(NextResponse.redirect).mockImplementation((url: string | URL) => {
      const headers = new Headers({ location: String(url) });
      return {
        status: 307,
        headers,
        cookies: {
          delete: jest.fn(),
          set: jest.fn(),
        },
      } as never;
    });

    jest.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: { id: "auth-user-1", email: "admin@work-hat.com" } },
        })),
      },
    } as never);
    jest.mocked(getCurrentAppUser).mockResolvedValue({
      id: "app-user-1",
      org_id: "org-1",
      role: "admin",
    } as never);
    jest.mocked(hasCapability).mockResolvedValue(true);
    jest.mocked(exchangeGmailCode).mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
      token_type: "Bearer",
    } as never);
    jest.mocked(fetchGmailProfile).mockResolvedValue({
      emailAddress: "Info@Work-Hat.com",
      historyId: "history-1",
    } as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.GOOGLE_PUBSUB_TOPIC;
  });

  it("exchanges code, persists encrypted tokens, activates Gmail, and imports recent mail", async () => {
    const emailExisting = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({ data: null, error: null })),
    };
    const emailUpsert = {
      upsert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(async () => ({ data: { id: "conn-1" }, error: null })),
        })),
      })),
    };
    const channelSelect = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({ data: null, error: null })),
    };
    const channelInsert = {
      insert: jest.fn(async () => ({ error: null })),
    };
    let emailConnectionCalls = 0;
    let channelCalls = 0;
    const db = {
      from: jest.fn((table: string) => {
        if (table === "email_connections") {
          emailConnectionCalls += 1;
          return emailConnectionCalls === 1 ? emailExisting : emailUpsert;
        }
        if (table === "channels") {
          channelCalls += 1;
          return channelCalls === 1 ? channelSelect : channelInsert;
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    jest.mocked(createAdminClient).mockReturnValue(db as never);

    const state = encodeState({
      nonce: "nonce-1",
      orgId: "org-1",
      userId: "app-user-1",
      returnTo: "/onboarding?step=inbox",
      iat: Date.now(),
    });

    const response = await googleOAuthCallback(req(
      `https://work-hat.com/api/oauth/google/callback?code=auth-code&state=${state}`,
      {
        workhat_gmail_oauth_state: state,
        workhat_gmail_oauth_return_to: "/onboarding?step=inbox",
      }
    ));

    const redirect = new URL(response.headers.get("location") ?? "");
    expect(redirect.pathname).toBe("/onboarding");
    expect(redirect.searchParams.get("connected")).toBe("gmail");
    expect(exchangeGmailCode).toHaveBeenCalledWith({
      code: "auth-code",
      redirectUri: "https://work-hat.com/api/oauth/google/callback",
    });
    expect(emailUpsert.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gmail",
        connection_type: "oauth",
        provider_account_email: "info@work-hat.com",
        status: "active",
        inbound_enabled: true,
        outbound_enabled: true,
        access_token_ciphertext: "enc:access-token",
        refresh_token_ciphertext: "enc:refresh-token",
      }),
      { onConflict: "org_id,provider,provider_account_email,connection_type" }
    );
    expect(channelInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: "org-1",
      type: "email",
      provider: "gmail",
      status: "active",
    }));
    expect(importRecentGmailInbox).toHaveBeenCalledWith(expect.objectContaining({
      db,
      maxResults: 10,
    }));
    expect(markGmailSyncSuccess).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "org.settings_updated",
      orgId: "org-1",
      resourceType: "email_connection",
      resourceId: "conn-1",
    }));
  });
});

