/**
 * POST /api/org/create
 *
 * Called at Step 1 of onboarding. Creates org + user + channel.
 *
 * Tries admin client first (bypasses RLS). If service role key is
 * missing or invalid, falls back to the regular authenticated client
 * with SQL policies that allow org creation.
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

/** Try to create an admin client; return null if service role key is missing. */
function tryAdminClient() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;

    // Dynamic import to avoid throwing at module level
    const { createClient: createSBClient } = require("@supabase/supabase-js");
    return createSBClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized — please sign in first" }, { status: 401 });
    }

    // Use admin client if available, otherwise fall back to regular client
    const admin = tryAdminClient();
    const db = admin ?? supabase;
    const usingAdmin = Boolean(admin);

    // Validate body
    let body: CreateOrgBody | null;
    try {
      body = validateBody(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body) {
      return NextResponse.json({ error: "Organization name is required" }, { status: 422 });
    }

    // Check if user already has an org (idempotency)
    const { data: existingUser } = await db
      .from("users")
      .select("id, org_id, role")
      .eq("auth_user_id", user.id)
      .single();

    if (existingUser) {
      // User/org already exists — update org name and ensure channel exists
      const orgId = (existingUser as { org_id: string }).org_id;
      const slug = slugify(body.orgName) || "org";
      const inboundAddress = `inbound+${slug}@work-hat.com`;

      await db.from("organizations").update({ name: body.orgName }).eq("id", orgId);

      // Ensure channel exists
      const { data: existingChannel } = await db
        .from("channels")
        .select("id")
        .eq("org_id", orgId)
        .eq("type", "email")
        .single();

      if (!existingChannel) {
        await db.from("channels").insert({
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
      }

      const { data: org } = await db
        .from("organizations")
        .select("id, name, slug")
        .eq("id", orgId)
        .single();

      return NextResponse.json({
        org,
        user: { id: existingUser.id, role: existingUser.role },
        created: false,
        method: usingAdmin ? "admin" : "client",
      });
    }

    // ── Fresh org creation ──────────────────────────────────────────────────

    const baseSlug = slugify(body.orgName) || "org";
    let slug = baseSlug;

    const { data: slugCheck } = await db
      .from("organizations")
      .select("slug")
      .like("slug", `${baseSlug}%`);

    if (slugCheck && slugCheck.length > 0) {
      slug = `${baseSlug}-${slugCheck.length + 1}`;
    }

    // 1. Create organization
    const { data: org, error: orgErr } = await db
      .from("organizations")
      .insert({ name: body.orgName, slug, crm_plan: "starter", ai_plan: "starter" })
      .select("id, name, slug")
      .single();

    if (orgErr || !org) {
      console.error("[org/create] org insert failed:", orgErr?.message, orgErr?.code, orgErr?.details);
      return NextResponse.json({
        error: `Failed to create organization: ${orgErr?.message ?? "unknown error"}`,
        hint: usingAdmin ? "Admin client active" : "SUPABASE_SERVICE_ROLE_KEY not set — using regular client. RLS INSERT policy on organizations may be missing.",
        code: orgErr?.code,
      }, { status: 500 });
    }

    const orgId = (org as { id: string }).id;

    // 2. Create admin user row
    const { data: appUser, error: userErr } = await db
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
      console.error("[org/create] user insert failed:", userErr?.message, userErr?.code);
      // Roll back
      await db.from("organizations").delete().eq("id", orgId);
      return NextResponse.json({
        error: `Failed to create user record: ${userErr?.message ?? "unknown error"}`,
        hint: usingAdmin ? "Admin client active" : "RLS INSERT policy on users may be missing.",
        code: userErr?.code,
      }, { status: 500 });
    }

    // 3. Create default email channel
    const inboundAddress = `inbound+${slug}@work-hat.com`;
    const { error: channelErr } = await db.from("channels").insert({
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

    if (channelErr) {
      console.error("[org/create] channel insert failed:", channelErr.message);
      // Non-fatal — org and user exist
    }

    return NextResponse.json({
      org: org as { id: string; name: string; slug: string },
      user: appUser as { id: string; role: string },
      created: true,
      method: usingAdmin ? "admin" : "client",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[org/create] unhandled error:", message);
    return NextResponse.json({
      error: `Server error: ${message}`,
    }, { status: 500 });
  }
}
