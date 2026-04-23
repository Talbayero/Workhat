import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import {
  generateInboundWebhookSecret,
  hashInboundWebhookSecret,
  inboundWebhookSecretHint,
} from "@/lib/email-connector/webhook-secret";
import { createAdminClient } from "@/lib/supabase/admin";

type ChannelConfig = {
  display_name?: string;
  from_name?: string;
  reply_identity?: string;
  webhook_secret_hash?: string;
  webhook_secret_ciphertext?: string | null;
  webhook_secret_hint?: string;
  last_inbound_at?: string | null;
  last_error_at?: string | null;
  last_error_message?: string | null;
};

function appBaseUrl(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return req.nextUrl.origin;
}

function normalizeText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function databaseErrorResponse(error: { message?: string; code?: string; details?: string | null } | null | undefined) {
  const message = error?.message ?? "Unknown database error.";
  console.error("[custom-inbound] database write failed:", message, error?.code, error?.details ?? "");

  if (message.toLowerCase().includes("custom_inbound") && message.toLowerCase().includes("check")) {
    return NextResponse.json({
      error: "Custom inbound schema migration is incomplete.",
      hint: "Apply supabase/migrations/0036_custom_inbound_email.sql completely, including provider compatibility changes.",
    }, { status: 500 });
  }

  return NextResponse.json({ error: "Unable to create custom inbound channel." }, { status: 500 });
}

function serializeChannel(req: NextRequest, row: {
  id: string;
  status: string;
  inbound_address: string | null;
  config_json: ChannelConfig;
}, event?: { status: string; received_at: string; error_message: string | null } | null, oneTimeSecret?: string | null) {
  return {
    id: row.id,
    status: row.status,
    name: row.config_json.display_name ?? "Custom inbound",
    fromName: row.config_json.from_name ?? "",
    replyIdentity: row.config_json.reply_identity ?? "",
    inboundAddress: row.inbound_address,
    webhookEndpoint: `${appBaseUrl(req)}/api/inbound/email?channelId=${row.id}`,
    webhookSecret: oneTimeSecret ?? null,
    webhookSecretHint: row.config_json.webhook_secret_hint ?? (oneTimeSecret ? inboundWebhookSecretHint(oneTimeSecret) : null),
    lastInboundAt: row.config_json.last_inbound_at ?? null,
    lastErrorAt: row.config_json.last_error_at ?? null,
    lastErrorMessage: row.config_json.last_error_message ?? null,
    lastEvent: event ?? null,
  };
}

export async function GET(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "email/custom-inbound" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireCapability(appUser, "integrations.manage", "email/custom-inbound", req);
  if (denied) return denied;

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    console.error("[custom-inbound] admin client unavailable:", error);
    return NextResponse.json({ error: "Custom inbound channels are unavailable." }, { status: 503 });
  }

  const { data: channels, error } = await db
    .from("channels")
    .select("id, status, inbound_address, config_json")
    .eq("org_id", appUser.org_id)
    .eq("type", "email")
    .eq("provider", "custom_inbound")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[custom-inbound] channel query failed:", error.message);
    return NextResponse.json({ error: "Unable to load custom inbound channels." }, { status: 500 });
  }

  const channelRows = (channels ?? []) as {
    id: string;
    status: string;
    inbound_address: string | null;
    config_json: ChannelConfig;
  }[];
  const eventsByChannel = new Map<string, { status: string; received_at: string; error_message: string | null }>();

  if (channelRows.length > 0) {
    const { data: events } = await db
      .from("inbound_email_events")
      .select("channel_id, status, received_at, error_message")
      .eq("org_id", appUser.org_id)
      .in("channel_id", channelRows.map((channel) => channel.id))
      .order("received_at", { ascending: false })
      .limit(50);

    for (const event of (events ?? []) as { channel_id: string; status: string; received_at: string; error_message: string | null }[]) {
      if (!eventsByChannel.has(event.channel_id)) {
        eventsByChannel.set(event.channel_id, {
          status: event.status,
          received_at: event.received_at,
          error_message: event.error_message,
        });
      }
    }
  }

  return NextResponse.json({
    channels: channelRows.map((channel) => serializeChannel(req, channel, eventsByChannel.get(channel.id) ?? null)),
  });
}

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "email/custom-inbound" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireCapability(appUser, "integrations.manage", "email/custom-inbound", req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = normalizeText(body.action, 40) || "create";
  const channelId = normalizeText(body.channelId, 80);
  const name = normalizeText(body.name, 120) || "Custom inbound";
  const fromName = normalizeText(body.fromName, 120);
  const replyIdentity = normalizeText(body.replyIdentity, 254);

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    console.error("[custom-inbound] admin client unavailable:", error);
    return NextResponse.json({ error: "Custom inbound channels are unavailable." }, { status: 503 });
  }

  if (action === "regenerate") {
    if (!channelId) return NextResponse.json({ error: "channelId is required." }, { status: 400 });
    const secret = generateInboundWebhookSecret();
    const { data: existing, error: lookupError } = await db
      .from("channels")
      .select("id, status, inbound_address, config_json")
      .eq("id", channelId)
      .eq("org_id", appUser.org_id)
      .eq("provider", "custom_inbound")
      .maybeSingle();
    if (lookupError) return NextResponse.json({ error: "Unable to load channel." }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Custom inbound channel not found." }, { status: 404 });

    const config = {
      ...((existing as { config_json: ChannelConfig }).config_json ?? {}),
      webhook_secret_hash: hashInboundWebhookSecret(secret),
      webhook_secret_hint: inboundWebhookSecretHint(secret),
      webhook_secret_ciphertext: null,
    };
    const { data, error } = await db
      .from("channels")
      .update({ config_json: config })
      .eq("id", channelId)
      .eq("org_id", appUser.org_id)
      .select("id, status, inbound_address, config_json")
      .single();
    if (error || !data) return NextResponse.json({ error: "Unable to regenerate webhook token." }, { status: 500 });
    return NextResponse.json({ channel: serializeChannel(req, data as { id: string; status: string; inbound_address: string | null; config_json: ChannelConfig }, null, secret) });
  }

  if (action === "update") {
    if (!channelId) return NextResponse.json({ error: "channelId is required." }, { status: 400 });
    const { data: existing, error: lookupError } = await db
      .from("channels")
      .select("config_json")
      .eq("id", channelId)
      .eq("org_id", appUser.org_id)
      .eq("provider", "custom_inbound")
      .maybeSingle();
    if (lookupError) return NextResponse.json({ error: "Unable to load channel." }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Custom inbound channel not found." }, { status: 404 });

    const config = {
      ...((existing as { config_json: ChannelConfig }).config_json ?? {}),
      display_name: name,
      from_name: fromName,
      reply_identity: replyIdentity,
    };
    const { data, error } = await db
      .from("channels")
      .update({ config_json: config })
      .eq("id", channelId)
      .eq("org_id", appUser.org_id)
      .select("id, status, inbound_address, config_json")
      .single();
    if (error || !data) return NextResponse.json({ error: "Unable to update custom inbound channel." }, { status: 500 });
    return NextResponse.json({ channel: serializeChannel(req, data as { id: string; status: string; inbound_address: string | null; config_json: ChannelConfig }) });
  }

  const secret = generateInboundWebhookSecret();
  const config: ChannelConfig = {
    display_name: name,
    from_name: fromName,
    reply_identity: replyIdentity,
    webhook_secret_hash: hashInboundWebhookSecret(secret),
    webhook_secret_hint: inboundWebhookSecretHint(secret),
    last_inbound_at: null,
    last_error_at: null,
    last_error_message: null,
  };

  const { data, error } = await db
    .from("channels")
    .insert({
      org_id: appUser.org_id,
      type: "email",
      provider: "custom_inbound",
      status: "active",
      inbound_address: null,
      config_json: config,
    })
    .select("id, status, inbound_address, config_json")
    .single();

  if (error || !data) {
    return databaseErrorResponse(error);
  }

  return NextResponse.json({
    channel: serializeChannel(req, data as { id: string; status: string; inbound_address: string | null; config_json: ChannelConfig }, null, secret),
  }, { status: 201 });
}
