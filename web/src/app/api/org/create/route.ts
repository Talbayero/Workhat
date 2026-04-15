/**
 * POST /api/org/create
 *
 * Called at Step 1 of onboarding. Creates:
 *   1. An `organizations` row
 *   2. A `users` row for the calling user with role = admin
 *   3. A default `channels` row (email, status: active)
 *
 * Uses the admin client for all writes to bypass RLS — this route is
 * the bootstrap path before the user has an org, so RLS policies would
 * block the inserts if we used the regular client.
 *
 * Idempotent: if the user already has an org (e.g. from the auth trigger),
 * it updates the name/config to match what they entered in onboarding.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type CreateOrgBody = {
  orgName: string;
  supportEmail?: string;
  timezone?: string;
};

function validateBody(raw: unknown): CreateOrgBody | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.orgName !== "string" || !obj.orgName.trim()) return null;
  return {
    orgName: obj.orgName.trim(),
    supportEmail: typeof obj.supportEmail === "string" ? obj.supportEmail.trim() : undefined,
    timezone: typeof obj.timezone === "string" ? obj.timezone.trim() : undefined,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export async function POST(req: NextRequest) {
  // Auth check via regular client (validates the JWT)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // All data operations use the admin client to bypass RLS
  const admin = createAdminClient();

  // Idempotency: check if this auth user already has a users row + org
  // (the on_auth_user_created trigger may have already created one)
  const { data: existingUser } = await admin
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .single();

  // Validate body
  let body: CreateOrgBody | null;
  try {
    body = validateBody(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ error: "orgName is required" }, { status: 422 });
  }

  if (existingUser) {
    // User/org already exists — update org name and channel config to match
    // what the user entered in onboarding (the trigger uses a generic name)
    const orgId = (existingUser as { org_id: string }).org_id;
    const slug = slugify(body.orgName) || "org";
    const inboundAddress = `inbound+${slug}@work-hat.com`;

    await admin
      .from("organizations")
      .update({ name: body.orgName })
      .eq("id", orgId);

    // Upsert the channel
    const { data: existingChannel } = await admin
      .from("channels")
      .select("id")
      .eq("org_id", orgId)
      .eq("type", "email")
      .single();

    if (!existingChannel) {
      await admin.from("channels").insert({
        org_id: orgId,
        type: "email",
        provider: "postmark",
        status: "active",
        inbound_address: inboundAddress,
        config_json: {
          support_email: body.supportEmail ?? "",
          from_name: body.orgName,
          timezone: body.timezone ?? "America/New_York",
          inbound_address: inboundAddress,
        },
      });
    } else {
      await admin
        .from("channels")
        .update({
          inbound_address: inboundAddress,
          config_json: {
            support_email: body.supportEmail ?? "",
            from_name: body.orgName,
            timezone: body.timezone ?? "America/New_York",
            inbound_address: inboundAddress,
          },
        })
        .eq("id", (existingChannel as { id: string }).id);
    }

    const { data: org } = await admin
      .from("organizations")
      .select("id, name, slug")
      .eq("id", orgId)
      .single();

    return NextResponse.json({
      org,
      user: { id: existingUser.id, role: existingUser.role },
      created: false,
    });
  }

  // ── Fresh org creation ────────────────────────────────────────────────────

  const baseSlug = slugify(body.orgName) || "org";
  let slug = baseSlug;

  const { data: existing } = await admin
    .from("organizations")
    .select("slug")
    .like("slug", `${baseSlug}%`);

  if (existing && existing.length > 0) {
    slug = `${baseSlug}-${existing.length + 1}`;
  }

  // 1. Create organization
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: body.orgName, slug, crm_plan: "starter", ai_plan: "starter" })
    .select("id, name, slug")
    .single();

  if (orgErr || !org) {
    console.error("[org/create] org insert failed:", orgErr?.message);
    return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
  }

  const orgId = (org as { id: string; name: string; slug: string }).id;

  // 2. Create admin user row
  const { data: appUser, error: userErr } = await admin
    .from("users")
    .insert({
      org_id: orgId,
      auth_user_id: user.id,
      full_name: user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Admin",
      email: user.email,
      role: "admin",
      status: "active",
    })
    .select("id, role")
    .single();

  if (userErr || !appUser) {
    console.error("[org/create] user insert failed:", userErr?.message);
    await admin.from("organizations").delete().eq("id", orgId);
    return NextResponse.json({ error: "Failed to create user record" }, { status: 500 });
  }

  // 3. Create default email channel
  const inboundAddress = `inbound+${slug}@work-hat.com`;
  await admin.from("channels").insert({
    org_id: orgId,
    type: "email",
    provider: "postmark",
    status: "active",
    inbound_address: inboundAddress,
    config_json: {
      support_email: body.supportEmail ?? "",
      from_name: body.orgName,
      timezone: body.timezone ?? "America/New_York",
      inbound_address: inboundAddress,
    },
  });

  return NextResponse.json({
    org: org as { id: string; name: string; slug: string },
    user: appUser as { id: string; role: string },
    created: true,
  });
}
