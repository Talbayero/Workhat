import {
  getEmailSetupReadiness,
  publicEmailSetupReadiness,
} from "@/lib/email-connector/setup-readiness";

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

  it("marks mailbox methods unavailable when required server setup is missing", () => {
    clearTrackedEnv();

    const readiness = getEmailSetupReadiness();

    expect(readiness.summary.googleOAuthConfigured).toBe(false);
    expect(readiness.summary.encryptionConfigured).toBe(false);
    expect(readiness.summary.serverDatabaseConfigured).toBe(false);
    expect(readiness.methods.oauth.status).toBe("unavailable");
    expect(readiness.methods.imap_smtp.status).toBe("unavailable");
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

    const readiness = getEmailSetupReadiness();

    expect(readiness.summary.googleOAuthConfigured).toBe(true);
    expect(readiness.summary.googleOAuthRoutesAvailable).toBe(true);
    expect(readiness.summary.googleRedirectUri).toBe("https://work-hat.com/api/oauth/google/callback");
    expect(readiness.methods.oauth.status).toBe("available");
    expect(readiness.methods.mailbox_password.status).toBe("unavailable");
  });

  it("allows credential mailbox self-serve readiness without requiring Gmail OAuth", () => {
    clearTrackedEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

    const readiness = getEmailSetupReadiness();

    expect(readiness.summary.googleOAuthConfigured).toBe(false);
    expect(readiness.summary.credentialMailboxConfigured).toBe(true);
    expect(readiness.methods.oauth.status).toBe("unavailable");
    expect(readiness.methods.imap_smtp.status).toBe("available");
    expect(readiness.summary.nextAction).toBe("Mailbox setup is ready for self-serve use.");
  });

  it("hides admin-only env names from non-admin readiness responses", () => {
    clearTrackedEnv();

    const publicReadiness = publicEmailSetupReadiness(getEmailSetupReadiness(), false);

    expect(publicReadiness.summary.missingRequiredEnv).toEqual([]);
    expect(publicReadiness.methods.oauth).not.toHaveProperty("adminMessage");
    expect(publicReadiness.summary.nextAction).toBe("Ask a workspace administrator to finish mailbox setup.");
  });
});
