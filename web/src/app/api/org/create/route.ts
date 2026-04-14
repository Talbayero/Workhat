/**
 * POST /api/org/create
 *
 * Called at Step 1 of onboarding. Creates:
 *   1. An `organizations` row
 *   2. A `users` row for the calling user with role = admin
 *   3. A default `channels` row (email, status: active)
 *
 * Idempotent: if the user already has an org, returns it instead of creating a new one.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();

  // Must be authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Idempotency: check if this auth user already has a users row + org
  const { data: existingUser } = await supabase
    .from("users")
    .select("id, org_id, role, organizations(id, name, slug)")
    .eq("auth_user_id", user.id)
    .single();

  if (existingUser) {
    const raw = (existingUser as unknown as { organizations: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] }).organizations;
    const org = Array.isArray(raw) ? raw[0] : raw;
    return NextResponse.json({
      org,
      user: { id: existingUser.id, role: existingUser.role },
      created: false,
    });
  }

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

  // Generate a unique slug
  const baseSlug = slugify(body.orgName) || "org";

  // Check for slug collisions and append a suffix if needed
  let slug = baseSlug;
  const { data: existing } = await supabase
    .from("organizations")
    .select("slug")
    .like("slug", `${baseSlug}%`);

  if (existing && existing.length > 0) {
    slug = `${baseSlug}-${existing.length + 1}`;
  }

  // 1. Create organization
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({
      name: body.orgName,
      slug,
      crm_plan: "starter",
      ai_plan: "starter",
    })
    .select("id, name, slug")
    .single();

  if (orgErr || !org) {
    console.error("[org/create] org insert failed:", orgErr?.message);
    return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
  }

  const orgId = (org as { id: string; name: string; slug: string }).id;

  // 2. Create admin user row
  const { data: appUser, error: userErr } = await supabase
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
    // Roll back org if user creation fails
    await supabase.from("organizations").delete().eq("id", orgId);
    return NextResponse.json({ error: "Failed to create user record" }, { status: 500 });
  }

  // 3. Create default email channel
  const inboundAddress = `inbound+${slug}@work-hat.com`;
  await supabase.from("channels").insert({
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
