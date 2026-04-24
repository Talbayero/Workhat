import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractInboundToken,
  normalizeInboundEmailPayload,
  processInboundEmail,
  resolveInboundChannel,
  verifyInboundChannelToken,
} from "@/lib/email/inbound";
import { logAudit } from "@/lib/security/audit-logger";

/* POST /api/inbound/email
 *
 * Provider-neutral inbound email webhook for non-Gmail sources. Supported
 * callers include custom SMTP relays, Postmark-style inbound parsers, and
 * internal dogfooding relays.
 *
 * Authentication:
 *   Authorization: Bearer <channel-secret>
 *   or X-WorkHat-Inbound-Token: <channel-secret>
 *   or X-Inbound-Token: <channel-secret> for legacy compatibility.
 *
 * Channel resolution:
 *   Prefer ?channelId=<uuid>. If omitted, recipients are matched against
 *   channels.inbound_address.
 */

export async function POST(req: NextRequest) {
  let rawPayload: unknown;
  try {
    rawPayload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const normalized = normalizeInboundEmailPayload(rawPayload);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 422 });
  }

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    console.error("[inbound/email] admin client unavailable:", error);
    return NextResponse.json({ error: "Inbound email is temporarily unavailable." }, { status: 503 });
  }

  let channel;
  try {
    channel = await resolveInboundChannel({
      db,
      channelId: req.nextUrl.searchParams.get("channelId"),
      recipients: normalized.message.to,
    });
  } catch (error) {
    console.error("[inbound/email] channel lookup failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to resolve inbound channel." }, { status: 500 });
  }

  if (!channel) {
    console.warn("[inbound/email] no channel matched inbound recipients");
    return NextResponse.json({ ok: true, skipped: "unknown_channel" }, { status: 202 });
  }

  if (channel.status !== "active") {
    return NextResponse.json({ ok: true, skipped: "channel_not_active" }, { status: 202 });
  }

  const token = extractInboundToken(req.headers);
  let authorized = false;
  try {
    authorized = verifyInboundChannelToken(channel, token);
  } catch (error) {
    console.error("[inbound/email] token verification failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Inbound channel secret is not configured." }, { status: 503 });
  }

  if (!authorized) {
    await logAudit({
      action: "security.suspicious_request",
      orgId: channel.org_id,
      resourceType: "channel",
      resourceId: channel.id,
      success: false,
      errorMessage: "Invalid inbound email webhook token",
      req,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processInboundEmail({
      db,
      channel,
      message: normalized.message,
      source: "api.inbound.email",
    });

    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inbound email processing failed.";
    console.error("[inbound/email] processing failed:", message);
    return NextResponse.json({ error: "Inbound email processing failed.", detail: message }, { status: 500 });
  }
}

