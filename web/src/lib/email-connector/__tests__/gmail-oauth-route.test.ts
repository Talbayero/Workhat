jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/auth/app-user", () => ({
  getCurrentAppUser: jest.fn(),
}));

jest.mock("@/lib/auth/capabilities", () => ({
  hasCapability: jest.fn(),
}));

import { GET as startGoogleOAuth } from "@/app/api/oauth/google/start/route";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { hasCapability } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const TRACKED_ENV = [
  "APP_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

const originalEnv = Object.fromEntries(TRACKED_ENV.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of TRACKED_ENV) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function mockSignedInUser() {
  jest.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { id: "auth-user-1" } },
      })),
    },
  } as never);
  jest.mocked(getCurrentAppUser).mockResolvedValue({
    id: "app-user-1",
    org_id: "org-1",
    role: "admin",
  } as never);
  jest.mocked(hasCapability).mockResolvedValue(true);
}

function req(url: string) {
  return {
    nextUrl: new URL(url),
    url,
  } as never;
}

describe("GET /api/oauth/google/start", () => {
  beforeEach(() => {
    jest.mocked(NextResponse.redirect).mockImplementation((url: string | URL) => {
      const headers = new Headers({ location: String(url) });
      return {
        status: 307,
        headers,
        cookies: {
          set: jest.fn((name: string, value: string) => {
            headers.append("set-cookie", `${name}=${value}`);
          }),
          delete: jest.fn(),
        },
      } as never;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    restoreEnv();
  });

  it("redirects signed-in admins to Google with the canonical callback URI", async () => {
    process.env.APP_BASE_URL = "https://work-hat.com";
    process.env.GOOGLE_CLIENT_ID = "client.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    mockSignedInUser();

    const response = await startGoogleOAuth(req("https://preview.vercel.app/api/oauth/google/start?returnTo=/onboarding"));
    const redirect = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(redirect.hostname).toBe("accounts.google.com");
    expect(redirect.searchParams.get("client_id")).toBe("client.apps.googleusercontent.com");
    expect(redirect.searchParams.get("redirect_uri")).toBe("https://work-hat.com/api/oauth/google/callback");
    expect(redirect.searchParams.get("response_type")).toBe("code");
    expect(redirect.searchParams.get("access_type")).toBe("offline");
    expect(response.headers.get("set-cookie")).toContain("workhat_gmail_oauth_state=");
  });

  it("does not start OAuth when Google env vars are missing", async () => {
    process.env.APP_BASE_URL = "https://work-hat.com";
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    mockSignedInUser();

    const response = await startGoogleOAuth(req("https://work-hat.com/api/oauth/google/start?returnTo=/onboarding"));
    const redirect = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(redirect.pathname).toBe("/onboarding");
    expect(redirect.searchParams.get("emailError")).toBe("Google OAuth is not configured by your workspace admin.");
  });
});
