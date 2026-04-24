import { sendOutboundForConnection, type MailboxConnectionRecord, type OutboundSendResult } from "@/lib/email-connector/adapters";
import { isActiveMailboxStatus } from "@/lib/email-connector/mailbox-status";
import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

export async function getActiveOutboundConnection(db: Db, orgId: string): Promise<MailboxConnectionRecord | null> {
  const { data, error } = await db
    .from("email_connections")
    .select(
      "id, org_id, provider, connection_type, provider_account_email, display_name, status, sync_status, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes, last_history_id, watch_expires_at, last_sync_at, inbound_enabled, outbound_enabled, last_validated_at, last_inbound_sync_at, last_outbound_send_at, last_error_code, last_error_message, error_message, diagnostics_json, credential_metadata, provider_metadata"
    )
    .eq("org_id", orgId)
    .eq("provider", "gmail")
    .eq("connection_type", "oauth")
    .eq("outbound_enabled", true)
    .in("status", ["active", "connected"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || !isActiveMailboxStatus((data as { status?: string }).status)) return null;
  return data as MailboxConnectionRecord;
}

export async function sendConversationReply({
  db,
  orgId,
  conversationId,
  body,
}: {
  db: Db;
  orgId: string;
  conversationId: string;
  body: string;
}): Promise<OutboundSendResult | null> {
  const connection = await getActiveOutboundConnection(db, orgId);
  if (!connection) return null;
  return sendOutboundForConnection({ db }, connection, { orgId, conversationId, body });
}
