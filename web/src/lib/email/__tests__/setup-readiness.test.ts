import {
  getEmailSetupReadiness,
  publicEmailSetupReadiness,
} from "@/lib/email/setup-readiness";

const TRACKED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "APP_BASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "EMAIL_TOKEN_ENCRYPTION_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "GOOGLE_PUBSUB_TOPIC",
  "GMAIL_PUSH_TOKEN",
] as const;

const originalEnv = Object.fromEntries(TRACKED_ENV.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of TRACKED_ENV) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearTrackedEnv() {
  for (const key of TRACKED_ENV) delete process.env[key];
}

describe("email setup readiness", () => {
  afterEach(restoreEnv);

  it("marks Gmail OAuth not configured when required server setup is missing", () => {
    clearTrackedEnv();

    const readiness = getEmailSetupReadiness();

    expect(readiness.summary.googleOAuthConfigured).toBe(false);
    expect(readiness.summary.encryptionConfigured).toBe(false);
    expect(readiness.summary.serverDatabaseConfigured).toBe(false);
    expect(readiness.summary.gmailOAuthState).toBe("not_configured");
    expect(readiness.methods.oauth.status).toBe("not_configured");
    expect(Object.keys(readiness.methods)).toEqual(["oauth"]);
    expect(readiness.summary.missingRequiredEnv).toEqual(
      expect.arrayContaining(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_BASE_URL", "EMAIL_TOKEN_ENCRYPTION_KEY", "SUPABASE_SERVICE_ROLE_KEY"])
    );
  });

  it("exposes Gmail OAuth only after OAuth and encryption settings are configured", () => {
    clearTrackedEnv();
    process.env.APP_BASE_URL = "https://work-hat.com";
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

    const readiness = getEmailSetupReadiness();

    expect(readiness.summary.googleOAuthConfigured).toBe(true);
    expect(readiness.summary.googleOAuthRoutesAvailable).toBe(true);
    expect(readiness.summary.googleRedirectUri).toBe("https://work-hat.com/api/oauth/google/callback");
    expect(readiness.summary.gmailApiEnabledExpectation).toBe("The Work Hat-owned Google Cloud project must have Gmail API enabled.");
    expect(readiness.summary.gmailOAuthState).toBe("ready");
    expect(readiness.methods.oauth.status).toBe("ready");
    expect(Object.keys(readiness.methods)).toEqual(["oauth"]);
  });

  it("keeps credential mailbox methods out of the readiness contract during the Gmail-only MVP", () => {
    clearTrackedEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

    const readiness = getEmailSetupReadiness();

    expect(readiness.summary.googleOAuthConfigured).toBe(false);
    expect(readiness.summary.credentialMailboxConfigured).toBe(false);
    expect(readiness.methods.oauth.status).toBe("not_configured");
    expect(Object.keys(readiness.methods)).toEqual(["oauth"]);
    expect(readiness.summary.nextAction).toBe("Finish system setup before inviting non-admin users to connect mailboxes.");
  });

  it("hides admin-only env names from non-admin readiness responses", () => {
    clearTrackedEnv();

    const publicReadiness = publicEmailSetupReadiness(getEmailSetupReadiness(), false);

    expect(publicReadiness.summary.missingRequiredEnv).toEqual([]);
    expect(publicReadiness.methods.oauth).not.toHaveProperty("adminMessage");
    expect(publicReadiness.summary.nextAction).toBe("Ask a Work Hat administrator to finish Gmail setup.");
  });
});

