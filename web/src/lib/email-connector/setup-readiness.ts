import { createOptionalAdminClient } from "@/lib/supabase/admin";

export type SetupMethodKey = "oauth" | "mailbox_password" | "app_password" | "imap_smtp" | "custom_inbound";
export type SetupAvailability = "available" | "unavailable";
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
    activeInboundAdapterAvailable: boolean;
    activeOutboundAdapterAvailable: boolean;
    missingRequiredEnv: string[];
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
    canonicalBaseUrlConfigured &&
    googleOAuthRoutesAvailable;
  const credentialMailboxConfigured = adminConfigured && encryptionConfigured;
  const customInboundConfigured = adminConfigured;

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
        : "Required for server-side mailbox validation, polling, custom inbound setup, and outbound sending.",
      adminOnly: true,
    },
    check("UPSTASH_REDIS_REST_URL", "Redis URL", "Recommended for production request protection.", false),
    check("UPSTASH_REDIS_REST_TOKEN", "Redis token", "Recommended for production request protection.", false),
    check("GOOGLE_PUBSUB_TOPIC", "Gmail live update topic", "Optional. Without it, Gmail still supports manual import but not live watch.", false),
    check("GMAIL_PUSH_TOKEN", "Gmail push token", "Optional unless Gmail live watch is enabled.", false),
  ];

  const missingRequiredEnv = checks
    .filter((item) => item.status === "fail")
    .map((item) => item.key);

  const methods: SetupReadiness["methods"] = {
    oauth: googleOAuthConfigured
      ? {
          key: "oauth",
          status: "available",
          userMessage: "Gmail OAuth is available.",
        }
      : {
          key: "oauth",
          status: "unavailable",
          userMessage: "Gmail OAuth is not available for this workspace yet.",
          adminMessage: googleRedirectUri
            ? `Set Google OAuth env vars and add ${googleRedirectUri} to Google authorized redirect URIs.`
            : "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, EMAIL_TOKEN_ENCRYPTION_KEY, and APP_BASE_URL.",
        },
    mailbox_password: credentialMailboxConfigured
      ? {
          key: "mailbox_password",
          status: "available",
          userMessage: "Mailbox password setup is available for providers that still allow direct mailbox authentication.",
        }
      : {
          key: "mailbox_password",
          status: "unavailable",
          userMessage: "Mailbox password setup is not available yet.",
          adminMessage: "Set EMAIL_TOKEN_ENCRYPTION_KEY and the server database key.",
        },
    app_password: credentialMailboxConfigured
      ? {
          key: "app_password",
          status: "available",
          userMessage: "App-password setup is available.",
        }
      : {
          key: "app_password",
          status: "unavailable",
          userMessage: "App-password setup is not available yet.",
          adminMessage: "Set EMAIL_TOKEN_ENCRYPTION_KEY and the server database key.",
        },
    imap_smtp: credentialMailboxConfigured
      ? {
          key: "imap_smtp",
          status: "available",
          userMessage: "IMAP/SMTP setup is available.",
        }
      : {
          key: "imap_smtp",
          status: "unavailable",
          userMessage: "IMAP/SMTP setup is not available yet.",
          adminMessage: "Set EMAIL_TOKEN_ENCRYPTION_KEY and the server database key.",
        },
    custom_inbound: customInboundConfigured
      ? {
          key: "custom_inbound",
          status: "available",
          userMessage: "Advanced webhook setup is available.",
        }
      : {
          key: "custom_inbound",
          status: "unavailable",
          userMessage: "Advanced webhook setup is not available yet.",
          adminMessage: "Set the server database key.",
        },
  };

  const activeInboundAdapterAvailable =
    googleOAuthConfigured || credentialMailboxConfigured || customInboundConfigured;
  const activeOutboundAdapterAvailable = googleOAuthConfigured || credentialMailboxConfigured;
  const nextAction = activeInboundAdapterAvailable && activeOutboundAdapterAvailable
    ? "Mailbox setup is ready for self-serve use."
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
      activeInboundAdapterAvailable,
      activeOutboundAdapterAvailable,
      missingRequiredEnv,
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
        ? "Ask a workspace administrator to finish mailbox setup."
        : readiness.summary.nextAction,
    },
  };
}
