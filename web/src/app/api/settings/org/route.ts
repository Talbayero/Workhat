/**
 * GET  /api/settings/org  — fetch current org details
 * PATCH /api/settings/org — update org name, support email, timezone
 *
 * Only admins can update org settings.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOptionalString(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function isValidTimezone(value: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

async function getCallerAndOrg(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser, error } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[settings/org] caller lookup failed:", error.message);
    return null;
  }

  return appUser as { id: string; org_id: string; role: string } | null;
}

export async function GET() {
  const supabase = await createClient();
  const caller = await getCallerAndOrg(supabase);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name, slug, crm_plan, ai_plan")
    .eq("id", caller.org_id)
    .maybeSingle();

  if (error || !org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // Fetch channel config for support email / from_name
  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .select("config_json")
    .eq("org_id", caller.org_id)
    .eq("type", "email")
    .maybeSingle();

  if (channelError) {
    return NextResponse.json({ error: "Failed to fetch channel settings" }, { status: 500 });
  }

  const config = (channel as { config_json: Record<string, string> } | null)?.config_json ?? {};

  return NextResponse.json({
    org,
    channel: {
      supportEmail: config.support_email ?? "",
      fromName: config.from_name ?? "",
      timezone: config.timezone ?? "America/New_York",
      inboundAddress: config.inbound_address ?? "",
    },
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const caller = await getCallerAndOrg(supabase);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can update org settings" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Update org name if provided
  if ("name" in body) {
    const name = normalizeOptionalString(body.name);
    if (!name) return NextResponse.json({ error: "Organization name cannot be empty." }, { status: 400 });

    const { error } = await supabase
      .from("organizations")
      .update({ name })
      .eq("id", caller.org_id);

    if (error) {
      return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
    }
  }

  // Update channel config (support email, from name, timezone)
  const channelUpdates: Record<string, string> = {};

  if ("supportEmail" in body) {
    const supportEmail = normalizeOptionalString(body.supportEmail);
    if (supportEmail === undefined) return NextResponse.json({ error: "Support email must be text." }, { status: 400 });
    if (supportEmail && !EMAIL_RE.test(supportEmail)) return NextResponse.json({ error: "Enter a valid support email." }, { status: 400 });
    channelUpdates.support_email = supportEmail ?? "";
  }

  if ("fromName" in body) {
    const fromName = normalizeOptionalString(body.fromName);
    if (fromName === undefined) return NextResponse.json({ error: "From name must be text." }, { status: 400 });
    channelUpdates.from_name = fromName ?? "";
  }

  if ("timezone" in body) {
    const timezone = normalizeOptionalString(body.timezone);
    if (!timezone || !isValidTimezone(timezone)) return NextResponse.json({ error: "Enter a valid timezone." }, { status: 400 });
    channelUpdates.timezone = timezone;
  }

  if (Object.keys(channelUpdates).length > 0) {
    // Merge into existing config_json
    const { data: existing, error: channelError } = await supabase
      .from("channels")
      .select("id, config_json")
      .eq("org_id", caller.org_id)
      .eq("type", "email")
      .maybeSingle();

    if (channelError) {
      return NextResponse.json({ error: "Failed to fetch channel settings" }, { status: 500 });
    }

    if (existing) {
      const merged = {
        ...(existing as { config_json: Record<string, string> }).config_json,
        ...channelUpdates,
      };
      const { error: updateError } = await supabase
        .from("channels")
        .update({ config_json: merged })
        .eq("id", (existing as { id: string }).id);

      if (updateError) {
        return NextResponse.json({ error: "Failed to update channel settings" }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabase
        .from("channels")
        .insert({
          org_id: caller.org_id,
          type: "email",
          provider: "work_hat",
          status: "active",
          config_json: channelUpdates,
        });

      if (insertError) {
        return NextResponse.json({ error: "Failed to create channel settings" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
