import type { MailboxConnectionRecord } from "@/lib/email/adapters/types";
import type { InboundChannel } from "@/lib/email/inbound";
import type { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function ensureMailboxChannel({
  db,
  connection,
}: {
  db: Db;
  connection: MailboxConnectionRecord;
}): Promise<InboundChannel> {
  const metadata = asRecord(connection.provider_metadata);
  const supportEmail = connection.provider_account_email;
  const senderName = typeof metadata.sender_name === "string" && metadata.sender_name.trim()
    ? metadata.sender_name.trim()
    : connection.display_name || supportEmail;

  const { data: directChannel, error: directChannelError } = await db
    .from("channels")
    .select("id, org_id, provider, status, inbound_address, config_json")
    .eq("org_id", connection.org_id)
    .eq("type", "email")
    .contains("config_json", { direct_connection_id: connection.id })
    .maybeSingle();
  if (directChannelError) throw new Error(directChannelError.message);

  const nextConfig = {
    ...asRecord((directChannel as { config_json?: unknown } | null)?.config_json),
    direct_connection_provider: connection.provider,
    direct_connection_type: connection.connection_type,
    direct_connection_id: connection.id,
    provider_account_email: supportEmail,
    support_email: supportEmail,
    from_name: senderName,
  };

  if (directChannel) {
    const { data, error } = await db
      .from("channels")
      .update({
        provider: connection.provider,
        status: "active",
        config_json: nextConfig,
      })
      .eq("id", (directChannel as { id: string }).id)
      .eq("org_id", connection.org_id)
      .select("id, org_id, provider, status, inbound_address, config_json")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to activate mailbox channel.");
    return data as InboundChannel;
  }

  const { data: existing, error: existingError } = await db
    .from("channels")
    .select("id, org_id, provider, status, inbound_address, config_json")
    .eq("org_id", connection.org_id)
    .eq("type", "email")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const { data, error } = await db
      .from("channels")
      .update({
        provider: connection.provider,
        status: "active",
        config_json: {
          ...asRecord((existing as { config_json?: unknown }).config_json),
          ...nextConfig,
        },
      })
      .eq("id", (existing as { id: string }).id)
      .eq("org_id", connection.org_id)
      .select("id, org_id, provider, status, inbound_address, config_json")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to activate mailbox channel.");
    return data as InboundChannel;
  }

  const { data, error } = await db
    .from("channels")
    .insert({
      org_id: connection.org_id,
      type: "email",
      provider: connection.provider,
      status: "active",
      config_json: nextConfig,
    })
    .select("id, org_id, provider, status, inbound_address, config_json")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create mailbox channel.");
  return data as InboundChannel;
}

export async function resolveMailboxChannel({
  db,
  connection,
}: {
  db: Db;
  connection: MailboxConnectionRecord;
}): Promise<InboundChannel> {
  return ensureMailboxChannel({ db, connection });
}

