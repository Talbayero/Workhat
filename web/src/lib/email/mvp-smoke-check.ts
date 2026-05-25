import { getConversations } from "@/lib/data/inbox";
import { GMAIL_IMPORT_QUERY } from "@/lib/email/google";
import type { GmailImportResultSummary } from "@/lib/email/import-result";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getSafeOrgAISettings } from "@/lib/ai-settings";

type Db = ReturnType<typeof createAdminClient>;

export type MvpSmokeCheckStatus = "pass" | "warn" | "fail";

export type MvpSmokeCheckItem = {
  key: string;
  label: string;
  status: MvpSmokeCheckStatus;
  message: string;
};

export type MvpSmokeCheckResult = {
  ok: boolean;
  requestId?: string;
  orgId: string;
  emailConnectionId: string | null;
  connectedMailbox: string | null;
  importRoute: string;
  importQuery: string;
  latestImportResult: (GmailImportResultSummary & {
    updatedAt?: string | null;
    mode?: string | null;
    latestHistoryId?: string | null;
  }) | null;
  counts: {
    inboxVisibleConversations: number;
    gmailImportedMessages: number;
    gmailImportedConversations: number;
    visibleImportedConversations: number;
  };
  checks: MvpSmokeCheckItem[];
};

type ConnectionRow = {
  id: string;
  org_id: string;
  provider_account_email: string | null;
  status: string | null;
  sync_status: string | null;
  connection_type: string | null;
  provider: string | null;
  inbound_enabled: boolean | null;
  outbound_enabled: boolean | null;
  last_sync_at: string | null;
  last_inbound_sync_at: string | null;
  last_outbound_send_at: string | null;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  provider_metadata: Record<string, unknown> | null;
};

type MessageLinkRow = {
  conversation_id: string | null;
  channel_message_id: string | null;
};

function check(
  key: string,
  label: string,
  status: MvpSmokeCheckStatus,
  message: string
): MvpSmokeCheckItem {
  return { key, label, status, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function extractLatestImportResult(
  providerMetadata: Record<string, unknown> | null
): MvpSmokeCheckResult["latestImportResult"] {
  const raw = asRecord(providerMetadata?.last_import_result);
  if (!raw) return null;

  return {
    updatedAt: stringFromRecord(raw, "updatedAt"),
    mode: stringFromRecord(raw, "mode"),
    latestHistoryId: stringFromRecord(raw, "latestHistoryId"),
    scanned: numberFromRecord(raw, "scanned"),
    imported: numberFromRecord(raw, "imported"),
    skipped: numberFromRecord(raw, "skipped"),
    errors: numberFromRecord(raw, "errors"),
    skipReasons: asRecord(raw.skipReasons) as Record<string, number> | null ?? {},
    errorReasons: asRecord(raw.errorReasons) as Record<string, number> | null ?? {},
  };
}

async function getActiveGmailConnection(db: Db, orgId: string) {
  const { data, error } = await db
    .from("email_connections")
    .select(
      "id, org_id, provider, connection_type, provider_account_email, status, sync_status, inbound_enabled, outbound_enabled, last_sync_at, last_inbound_sync_at, last_outbound_send_at, access_token_ciphertext, refresh_token_ciphertext, provider_metadata"
    )
    .eq("org_id", orgId)
    .eq("provider", "gmail")
    .eq("connection_type", "oauth")
    .in("status", ["active", "connected"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ConnectionRow | null;
}

async function getGmailMessageLinks(db: Db, orgId: string) {
  const { data, error } = await db
    .from("messages")
    .select("conversation_id, channel_message_id")
    .eq("org_id", orgId)
    .eq("direction", "inbound")
    .like("channel_message_id", "gmail:%")
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []) as MessageLinkRow[];
}

export async function runGmailMvpSmokeCheck({
  db,
  orgId,
  requestId,
}: {
  db: Db;
  orgId: string;
  requestId?: string;
}): Promise<MvpSmokeCheckResult> {
  const checks: MvpSmokeCheckItem[] = [];
  const connection = await getActiveGmailConnection(db, orgId);
  const latestImportResult = extractLatestImportResult(connection?.provider_metadata ?? null);
  const importAttempted = Boolean(connection?.last_inbound_sync_at || connection?.last_sync_at || latestImportResult);

  checks.push(check(
    "active_gmail_oauth_connection",
    "Active Gmail OAuth connection",
    connection ? "pass" : "fail",
    connection
      ? `Active Gmail OAuth connection found for ${connection.provider_account_email ?? "connected mailbox"}.`
      : "No active Gmail OAuth connection exists for this workspace."
  ));

  checks.push(check(
    "latest_gmail_import_attempted",
    "Latest Gmail import attempted",
    importAttempted ? "pass" : "fail",
    importAttempted
      ? "At least one Gmail import attempt is recorded for this connection."
      : "No Gmail import attempt is recorded yet. Run Import latest email."
  ));

  checks.push(check(
    "latest_import_summary_available",
    "Latest import summary available",
    latestImportResult ? "pass" : "fail",
    latestImportResult
      ? `Latest safe import summary is stored. Scanned ${latestImportResult.scanned ?? 0}, imported ${latestImportResult.imported ?? 0}, skipped ${latestImportResult.skipped ?? 0}, errors ${latestImportResult.errors ?? 0}.`
      : "No structured import summary is stored yet. Run Import latest email."
  ));

  let inboxVisibleConversations = 0;
  let visibleImportedConversations = 0;
  let gmailImportedMessages = 0;
  let gmailImportedConversations = 0;
  let inboxError: string | null = null;
  let messageLinkError: string | null = null;

  try {
    const [conversations, messageLinks] = await Promise.all([
      getConversations(),
      getGmailMessageLinks(db, orgId),
    ]);
    const visibleConversationIds = new Set(conversations.map((conversation) => conversation.id));
    const gmailConversationIds = new Set(
      messageLinks.map((message) => message.conversation_id).filter((id): id is string => Boolean(id))
    );

    inboxVisibleConversations = conversations.length;
    gmailImportedMessages = messageLinks.length;
    gmailImportedConversations = gmailConversationIds.size;
    visibleImportedConversations = [...gmailConversationIds].filter((id) => visibleConversationIds.has(id)).length;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inbox visibility check failed.";
    if (message.toLowerCase().includes("message")) messageLinkError = message;
    else inboxError = message;
  }

  checks.push(check(
    "gmail_imported_conversation_visible",
    "Gmail-imported conversation visible through Inbox loader",
    visibleImportedConversations > 0 ? "pass" : "fail",
    visibleImportedConversations > 0
      ? `${visibleImportedConversations} Gmail-imported conversation${visibleImportedConversations === 1 ? "" : "s"} are visible through the Inbox loader.`
      : inboxError || messageLinkError || "No Gmail-imported conversations are visible through the Inbox loader yet."
  ));

  let aiConfigured = false;
  let aiMessage = "AI draft provider is not configured.";
  try {
    const aiSettings = await getSafeOrgAISettings(db, orgId);
    aiConfigured =
      aiSettings.aiMode !== "disabled" &&
      (
        (aiSettings.aiMode === "work_hat_managed" && aiSettings.platformManagedAvailable) ||
        (aiSettings.aiMode === "byo" && aiSettings.credential?.status === "active")
      );
    aiMessage = aiConfigured
      ? `AI drafting is configured with ${aiSettings.aiMode === "byo" ? "customer-managed OpenAI" : "Work Hat-managed OpenAI"}.`
      : aiSettings.aiMode === "disabled"
        ? "AI drafting is disabled for this workspace."
        : "AI drafting is not configured for the selected mode.";
  } catch (error) {
    aiMessage = error instanceof Error ? error.message : "AI draft provider check failed.";
  }
  checks.push(check(
    "ai_draft_provider_configured",
    "AI draft provider configured",
    aiConfigured ? "pass" : "fail",
    aiMessage
  ));

  const outboundAvailable = Boolean(
    connection &&
    connection.outbound_enabled &&
    (connection.access_token_ciphertext || connection.refresh_token_ciphertext)
  );
  checks.push(check(
    "gmail_outbound_available",
    "Gmail outbound available",
    outboundAvailable ? "pass" : "fail",
    outboundAvailable
      ? "Active Gmail OAuth connection has outbound enabled and server-side token material is present."
      : "No active Gmail OAuth connection is ready for approved outbound replies."
  ));

  const result: MvpSmokeCheckResult = {
    ok: checks.every((item) => item.status !== "fail"),
    requestId,
    orgId,
    emailConnectionId: connection?.id ?? null,
    connectedMailbox: connection?.provider_account_email ?? null,
    importRoute: "/api/email/gmail/sync",
    importQuery: GMAIL_IMPORT_QUERY,
    latestImportResult,
    counts: {
      inboxVisibleConversations,
      gmailImportedMessages,
      gmailImportedConversations,
      visibleImportedConversations,
    },
    checks,
  };

  console.info("[mvp/smoke-check] completed:", {
    requestId,
    orgId,
    emailConnectionId: result.emailConnectionId,
    connectedMailbox: result.connectedMailbox,
    ok: result.ok,
    counts: result.counts,
    latestImportCounts: latestImportResult
      ? {
          scanned: latestImportResult.scanned ?? 0,
          imported: latestImportResult.imported ?? 0,
          skipped: latestImportResult.skipped ?? 0,
          errors: latestImportResult.errors ?? 0,
        }
      : null,
  });

  return result;
}
