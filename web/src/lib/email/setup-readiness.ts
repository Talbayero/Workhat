import { createOptionalAdminClient } from "@/lib/supabase/admin";

export type SetupMethodKey = "oauth";
export type SetupAvailability = "ready" | "not_configured";
export type SetupCheckStatus = "pass" | "warn" | "fail";

export type SetupReadinessMethod = {
  key: SetupMethodKey;
  status: SetupAvailability;
  userMessage: string;
  adminMessage?: string;
};

export type SetupReadinessCheck = {
  key: string;
  label: string;
  status: SetupCheckStatus;
  message: string;
  adminOnly?: boolean;
};

export type SetupReadiness = {
  methods: Record<SetupMethodKey, SetupReadinessMethod>;
  checks: SetupReadinessCheck[];
  summary: {
    googleOAuthConfigured: boolean;
    googleRedirectUri: string | null;
    googleOAuthRoutesAvailable: boolean;
    canonicalBaseUrlConfigured: boolean;
    encryptionConfigured: boolean;
    serverDatabaseConfigured: boolean;
    credentialMailboxConfigured: boolean;
    customInboundConfigured: boolean;
    redisConfigured: boolean;
    manualImportReady: boolean;
    gmailWatchReady: boolean;
    watchRenewalReady: boolean;
    rateLimitReady: boolean;
    productionUrlReady: boolean;
    gmailApiEnabledExpectation: string;
    activeInboundAdapterAvailable: boolean;
    activeOutboundAdapterAvailable: boolean;
    missingRequiredEnv: string[];
    gmailOAuthState: SetupAvailability;
    nextAction: string;
  };
};

function hasEnv(name: string) {
  return Boolean(process.env[name]);
}

function check(name: string, label: string, message: string, required = true): SetupReadinessCheck {
  const configured = hasEnv(name);
  return {
    key: name,
    label,
    status: configured ? "pass" : required ? "fail" : "warn",
    message: configured ? "Configured." : message,
    adminOnly: true,
  };
}

export function getEmailSetupReadiness(): SetupReadiness {
  const adminState = createOptionalAdminClient();
  const adminConfigured = Boolean(adminState.client);
  const encryptionConfigured = hasEnv("EMAIL_TOKEN_ENCRYPTION_KEY");
  const googleClientConfigured = hasEnv("GOOGLE_CLIENT_ID");
  const googleSecretConfigured = hasEnv("GOOGLE_CLIENT_SECRET");
  const pubSubTopicConfigured = hasEnv("GOOGLE_PUBSUB_TOPIC");
  const gmailPushTokenConfigured = hasEnv("GMAIL_PUSH_TOKEN");
  const cronSecretConfigured = hasEnv("CRON_SECRET");
  const canonicalBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  const canonicalBaseUrlConfigured = Boolean(canonicalBaseUrl);
  const googleRedirectUri = canonicalBaseUrl
    ? `${canonicalBaseUrl.replace(/\/$/, "")}/api/oauth/google/callback`
    : null;
  const googleOAuthRoutesAvailable = true;
  const redisConfigured = hasEnv("UPSTASH_REDIS_REST_URL") && hasEnv("UPSTASH_REDIS_REST_TOKEN");

  const googleOAuthConfigured =
    googleClientConfigured &&
    googleSecretConfigured &&
    encryptionConfigured &&
    adminConfigured &&
    canonicalBaseUrlConfigured &&
    googleOAuthRoutesAvailable;
  const gmailWatchReady = googleOAuthConfigured && pubSubTopicConfigured && gmailPushTokenConfigured;
  const watchRenewalReady = gmailWatchReady && cronSecretConfigured;
  const credentialMailboxConfigured = false;
  const customInboundConfigured = false;

  const checks: SetupReadinessCheck[] = [
    check("GOOGLE_CLIENT_ID", "Google OAuth client ID", "Required before Gmail OAuth can be offered to users."),
    check("GOOGLE_CLIENT_SECRET", "Google OAuth client secret", "Required before Gmail OAuth can exchange authorization codes."),
    {
      key: "APP_BASE_URL",
      label: "Canonical app base URL",
      status: canonicalBaseUrlConfigured ? "pass" : "fail",
      message: "Required to generate one stable Google OAuth redirect URI.",
      adminOnly: true,
    },
    check("EMAIL_TOKEN_ENCRYPTION_KEY", "Mailbox credential encryption", "Required to store Gmail tokens and mailbox credentials safely."),
    {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      label: "Server database key",
      status: adminConfigured ? "pass" : "fail",
      message: adminConfigured
        ? "Configured."
        : "Required for Gmail OAuth token persistence, import, live sync, and approved reply sending.",
      adminOnly: true,
    },
    check("UPSTASH_REDIS_REST_URL", "Redis URL", "Recommended for production request protection.", false),
    check("UPSTASH_REDIS_REST_TOKEN", "Redis token", "Recommended for production request protection.", false),
    {
      key: "GMAIL_API_ENABLED",
      label: "Gmail API enabled",
      status: googleClientConfigured && googleSecretConfigured ? "warn" : "fail",
      message: googleClientConfigured && googleSecretConfigured
        ? "Platform owner must verify Gmail API is enabled in the Work Hat Google Cloud project."
        : "Platform Google OAuth must be configured before Gmail API readiness can be verified.",
      adminOnly: true,
    },
    check("GOOGLE_PUBSUB_TOPIC", "Gmail live update topic", "Optional. Without it, Gmail still supports manual import but not live watch.", false),
    check("GMAIL_PUSH_TOKEN", "Gmail push token", "Optional unless Gmail live watch is enabled.", false),
    check("CRON_SECRET", "Watch renewal cron secret", "Required before scheduled Gmail watch renewal can run safely.", false),
  ];

  const missingRequiredEnv = checks
    .filter((item) => item.status === "fail")
    .map((item) => item.key);

  const gmailOAuthState: SetupAvailability = googleOAuthConfigured ? "ready" : "not_configured";
  const methods: SetupReadiness["methods"] = {
    oauth: googleOAuthConfigured
      ? {
          key: "oauth",
          status: "ready",
          userMessage: "Ready",
        }
      : {
          key: "oauth",
          status: "not_configured",
          userMessage: "Admin setup required: Gmail OAuth is not configured",
          adminMessage: googleRedirectUri
            ? `Work Hat platform setup must use ${googleRedirectUri} as the authorized callback URI.`
            : "Set platform Google OAuth, token encryption, and canonical app URL configuration.",
        },
  };

  const activeInboundAdapterAvailable = googleOAuthConfigured;
  const activeOutboundAdapterAvailable = googleOAuthConfigured;
  const nextAction = activeInboundAdapterAvailable && activeOutboundAdapterAvailable
    ? "Gmail OAuth setup is ready for self-serve use."
    : activeInboundAdapterAvailable
      ? "Inbound setup is available. Configure an outbound-capable mailbox before sending approved replies."
      : "Finish system setup before inviting non-admin users to connect mailboxes.";

  return {
    methods,
    checks,
    summary: {
      googleOAuthConfigured,
      googleRedirectUri,
      googleOAuthRoutesAvailable,
      canonicalBaseUrlConfigured,
      encryptionConfigured,
      serverDatabaseConfigured: adminConfigured,
      credentialMailboxConfigured,
      customInboundConfigured,
      redisConfigured,
      manualImportReady: googleOAuthConfigured,
      gmailWatchReady,
      watchRenewalReady,
      rateLimitReady: redisConfigured,
      productionUrlReady: canonicalBaseUrlConfigured,
      gmailApiEnabledExpectation: "The Work Hat-owned Google Cloud project must have Gmail API enabled.",
      activeInboundAdapterAvailable,
      activeOutboundAdapterAvailable,
      missingRequiredEnv,
      gmailOAuthState,
      nextAction,
    },
  };
}

export function publicEmailSetupReadiness(readiness: SetupReadiness, includeAdminDetails: boolean) {
  if (includeAdminDetails) return readiness;

  return {
    ...readiness,
    checks: readiness.checks.filter((item) => !item.adminOnly).map((item) => ({
      ...item,
      key: item.status === "pass" ? item.key : "workspace_setup",
      message: item.status === "pass" ? item.message : "Workspace setup is incomplete. Ask an administrator to finish mailbox setup.",
    })),
    methods: Object.fromEntries(
      Object.entries(readiness.methods).map(([key, method]) => [
        key,
        {
          key: method.key,
          status: method.status,
          userMessage: method.userMessage,
        },
      ])
    ) as SetupReadiness["methods"],
    summary: {
      ...readiness.summary,
      missingRequiredEnv: [],
      nextAction: !readiness.summary.activeInboundAdapterAvailable
        ? "Ask a Work Hat administrator to finish Gmail setup."
        : readiness.summary.nextAction,
    },
  };
}
