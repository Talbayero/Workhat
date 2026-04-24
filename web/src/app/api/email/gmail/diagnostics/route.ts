import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createOptionalAdminClient } from "@/lib/supabase/admin";

type DiagnosticStatus = "pass" | "warn" | "fail";

type DiagnosticCheck = {
  key: string;
  label: string;
  status: DiagnosticStatus;
  message: string;
};

type GmailImportDiagnostics = {
  schema: Record<string, boolean>;
  counts: {
    conversations: number;
    messages: number;
    gmailMessages: number;
    gmailMessagesWithConversationId: number;
    gmailThreadConversations: number;
    orphanedGmailMessages: number;
    wrongOrgLinkedGmailMessages: number;
    inboundEvents: number;
    inboxRowsWithSlaSelect: number;
    inboxRowsWithLegacySelect: number;
  };
  samples: {
    conversationIds: string[];
    gmailMessageIds: string[];
    orphanedMessageIds: string[];
  };
  likelyRootCause: string | null;
};

const SLA_COLUMNS = [
  "sla_status",
  "sla_target",
  "sla_due_at",
  "sla_breached_at",
  "sla_last_evaluated_at",
  "first_response_due_at",
  "next_response_due_at",
] as const;

const INBOX_SELECT_WITH_SLA = `id, subject, status, priority, contact_id, company_id, assigned_to_name,
  assigned_user_id, risk_level, ai_confidence, preview, intent, tags, last_message_at,
  sla_status, sla_target, sla_due_at, sla_breached_at, sla_last_evaluated_at,
  contacts(full_name, email, phone, tier, notes, tags),
  companies(name), channels(type)`;

const INBOX_SELECT_LEGACY = `id, subject, status, priority, contact_id, company_id, assigned_to_name,
  assigned_user_id, risk_level, ai_confidence, preview, intent, tags, last_message_at,
  contacts(full_name, email, phone, tier, notes, tags),
  companies(name), channels(type)`;

function checkEnv(name: string, label: string, missingMessage: string, validator?: (value: string) => DiagnosticCheck) {
  const value = process.env[name];
  if (!value) {
    return {
      key: name,
      label,
      status: "fail" as const,
      message: missingMessage,
    };
  }

  return validator?.(value) ?? {
    key: name,
    label,
    status: "pass" as const,
    message: "Configured.",
  };
}

function checkEncryptionKey(value: string): DiagnosticCheck {
  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === 32) {
      return {
        key: "EMAIL_TOKEN_ENCRYPTION_KEY",
        label: "Token encryption key",
        status: "pass",
        message: "Configured as a 32-byte base64 key.",
      };
    }
  } catch {
    // Plain text secrets are supported through hashing below.
  }

  if (value.length >= 32) {
    return {
      key: "EMAIL_TOKEN_ENCRYPTION_KEY",
      label: "Token encryption key",
      status: "warn",
      message: "Configured as a text secret. This works, but a 32-byte base64 key is preferred.",
    };
  }

  return {
    key: "EMAIL_TOKEN_ENCRYPTION_KEY",
    label: "Token encryption key",
    status: "warn",
    message: "Configured, but short. Use a long random value before onboarding real customers.",
  };
}

function checkSupabaseAdmin(): DiagnosticCheck {
  const state = createOptionalAdminClient();
  if (state.client) {
    return {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      label: "Supabase admin key",
      status: "pass",
      message: state.keyRole === "secret" ? "Valid Supabase secret key detected." : "Valid service_role key detected.",
    };
  }

  if (state.reason === "invalid_service_role_key") {
    return {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      label: "Supabase admin key",
      status: "fail",
      message: `Configured key is not privileged${state.keyRole ? ` (${state.keyRole})` : ""}. Use sb_secret_... or the legacy service_role key.`,
    };
  }

  return {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Supabase admin key",
    status: "fail",
    message: "Required for Gmail sync, push imports, and server-side mailbox operations.",
  };
}

async function checkConversationColumn(
  db: NonNullable<ReturnType<typeof createOptionalAdminClient>["client"]>,
  orgId: string,
  column: string
) {
  const { error } = await db
    .from("conversations")
    .select(`id, ${column}`)
    .eq("org_id", orgId)
    .limit(1);

  return !error;
}

async function collectGmailImportDiagnostics(
  db: NonNullable<ReturnType<typeof createOptionalAdminClient>["client"]>,
  orgId: string
): Promise<GmailImportDiagnostics> {
  const schemaEntries = await Promise.all(
    SLA_COLUMNS.map(async (column) => [column, await checkConversationColumn(db, orgId, column)] as const)
  );

  const { error: orgSlaPoliciesError } = await db
    .from("org_sla_policies")
    .select("id")
    .eq("org_id", orgId)
    .limit(1);

  const schema = Object.fromEntries(schemaEntries) as Record<string, boolean>;
  schema.org_sla_policies = !orgSlaPoliciesError;

  const [conversationCountRes, messageCountRes, gmailMessageCountRes, gmailMessageWithConversationRes, gmailThreadConversationRes, inboundEventCountRes, inboxWithSlaRes, inboxLegacyRes, gmailMessagesRes, conversationIdsRes] = await Promise.all([
    db.from("conversations").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    db.from("messages").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    db.from("messages").select("*", { count: "exact", head: true }).eq("org_id", orgId).like("channel_message_id", "gmail:%"),
    db.from("messages").select("*", { count: "exact", head: true }).eq("org_id", orgId).like("channel_message_id", "gmail:%").not("conversation_id", "is", null),
    db.from("conversations").select("*", { count: "exact", head: true }).eq("org_id", orgId).like("external_thread_id", "gmail:%"),
    db.from("inbound_email_events").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    db.from("conversations").select(INBOX_SELECT_WITH_SLA).eq("org_id", orgId).order("last_message_at", { ascending: false }).limit(25),
    db.from("conversations").select(INBOX_SELECT_LEGACY).eq("org_id", orgId).order("last_message_at", { ascending: false }).limit(25),
    db.from("messages").select("id, conversation_id, channel_message_id").eq("org_id", orgId).like("channel_message_id", "gmail:%").order("created_at", { ascending: false }).limit(5000),
    db.from("conversations").select("id, org_id").eq("org_id", orgId).limit(5000),
  ]);

  const gmailMessages = (gmailMessagesRes.data ?? []) as { id: string; conversation_id: string | null; channel_message_id: string | null }[];
  const currentOrgConversationIds = new Set(((conversationIdsRes.data ?? []) as { id: string; org_id: string }[]).map((row) => row.id));
  const linkedConversationIds = [...new Set(gmailMessages.map((row) => row.conversation_id).filter((value): value is string => Boolean(value)))];
  const { data: linkedConversations, error: linkedConversationError } = linkedConversationIds.length > 0
    ? await db.from("conversations").select("id, org_id").in("id", linkedConversationIds)
    : { data: [], error: null };

  if (linkedConversationError) {
    console.warn("[gmail/diagnostics] linked conversation lookup failed:", linkedConversationError.message);
  }

  const linkedConversationOrg = new Map(
    ((linkedConversations ?? []) as { id: string; org_id: string }[]).map((row) => [row.id, row.org_id])
  );

  const orphanedMessages = gmailMessages.filter(
    (row) => row.conversation_id && !currentOrgConversationIds.has(row.conversation_id)
  );
  const wrongOrgLinkedMessages = gmailMessages.filter((row) => {
    if (!row.conversation_id) return false;
    const linkedOrgId = linkedConversationOrg.get(row.conversation_id);
    return Boolean(linkedOrgId && linkedOrgId !== orgId);
  });

  let likelyRootCause: string | null = null;
  if (Object.values(schema).some((exists) => !exists)) {
    likelyRootCause = "schema_lag";
  } else if (orphanedMessages.length > 0 || wrongOrgLinkedMessages.length > 0) {
    likelyRootCause = "orphaned_or_cross_org_gmail_messages";
  } else if ((gmailMessageCountRes.count ?? 0) > 0 && (conversationCountRes.count ?? 0) > 0 && inboxWithSlaRes.error) {
    likelyRootCause = "inbox_query_error";
  } else if ((gmailMessageCountRes.count ?? 0) > 0 && (conversationCountRes.count ?? 0) > 0 && (inboxLegacyRes.data?.length ?? 0) === 0) {
    likelyRootCause = "conversations_exist_but_not_visible_in_inbox_query";
  }

  return {
    schema,
    counts: {
      conversations: conversationCountRes.count ?? 0,
      messages: messageCountRes.count ?? 0,
      gmailMessages: gmailMessageCountRes.count ?? 0,
      gmailMessagesWithConversationId: gmailMessageWithConversationRes.count ?? 0,
      gmailThreadConversations: gmailThreadConversationRes.count ?? 0,
      orphanedGmailMessages: orphanedMessages.length,
      wrongOrgLinkedGmailMessages: wrongOrgLinkedMessages.length,
      inboundEvents: inboundEventCountRes.count ?? 0,
      inboxRowsWithSlaSelect: inboxWithSlaRes.data?.length ?? 0,
      inboxRowsWithLegacySelect: inboxLegacyRes.data?.length ?? 0,
    },
    samples: {
      conversationIds: ((inboxLegacyRes.data ?? []) as { id: string }[]).slice(0, 10).map((row) => row.id),
      gmailMessageIds: gmailMessages.slice(0, 10).map((row) => row.id),
      orphanedMessageIds: orphanedMessages.slice(0, 10).map((row) => row.id),
    },
    likelyRootCause,
  };
}

export async function GET() {
  const appUser = await getCurrentAppUser({ label: "gmail/diagnostics" });
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const denied = await requireCapability(appUser, "integrations.manage", "gmail/diagnostics");
  if (denied) return denied;

  const checks: DiagnosticCheck[] = [
    checkEnv("NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL", "Required for all database operations."),
    checkSupabaseAdmin(),
    checkEnv("GOOGLE_CLIENT_ID", "Google OAuth client ID", "Required before users can connect Gmail.", (value) => ({
      key: "GOOGLE_CLIENT_ID",
      label: "Google OAuth client ID",
      status: value.endsWith(".apps.googleusercontent.com") ? "pass" : "warn",
      message: value.endsWith(".apps.googleusercontent.com")
        ? "Configured."
        : "Configured, but it does not look like a standard Google OAuth web client id.",
    })),
    checkEnv("GOOGLE_CLIENT_SECRET", "Google OAuth client secret", "Required for OAuth token exchange."),
    checkEnv("EMAIL_TOKEN_ENCRYPTION_KEY", "Token encryption key", "Required to encrypt Gmail access and refresh tokens.", checkEncryptionKey),
    checkEnv("GOOGLE_PUBSUB_TOPIC", "Google Pub/Sub topic", "Required before Gmail live watch can be enabled.", (value) => ({
      key: "GOOGLE_PUBSUB_TOPIC",
      label: "Google Pub/Sub topic",
      status: value.startsWith("projects/") && value.includes("/topics/") ? "pass" : "warn",
      message: value.startsWith("projects/") && value.includes("/topics/")
        ? "Configured."
        : "Expected format: projects/{project-id}/topics/{topic-name}.",
    })),
    checkEnv("GMAIL_PUSH_TOKEN", "Gmail push verification token", "Required to protect the Pub/Sub push endpoint.", (value) => ({
      key: "GMAIL_PUSH_TOKEN",
      label: "Gmail push verification token",
      status: value.length >= 24 ? "pass" : "warn",
      message: value.length >= 24 ? "Configured." : "Configured, but short. Use a long random value.",
    })),
    checkEnv("CRON_SECRET", "Vercel Cron secret", "Required to protect Gmail watch renewal cron.", (value) => ({
      key: "CRON_SECRET",
      label: "Vercel Cron secret",
      status: value.length >= 24 ? "pass" : "warn",
      message: value.length >= 24 ? "Configured." : "Configured, but short. Use a long random value.",
    })),
    checkEnv("NEXT_PUBLIC_APP_URL", "Public app URL", "Recommended so Google OAuth redirect URIs are stable in production.", (value) => ({
      key: "NEXT_PUBLIC_APP_URL",
      label: "Public app URL",
      status: /^https:\/\/.+/.test(value) ? "pass" : "warn",
      message: /^https:\/\/.+/.test(value)
        ? "Configured."
        : "Use your production HTTPS URL, for example https://work-hat.com.",
    })),
  ];

  const summary = {
    pass: checks.filter((check) => check.status === "pass").length,
    warn: checks.filter((check) => check.status === "warn").length,
    fail: checks.filter((check) => check.status === "fail").length,
  };

  const adminState = createOptionalAdminClient();
  let gmailImportDiagnostics: GmailImportDiagnostics | null = null;
  if (adminState.client) {
    try {
      gmailImportDiagnostics = await collectGmailImportDiagnostics(adminState.client, appUser.org_id);
    } catch (error) {
      console.warn("[gmail/diagnostics] import diagnostics failed:", error);
    }
  }

  return NextResponse.json({ checks, summary, gmailImportDiagnostics });
}
