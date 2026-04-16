/**
 * POST /api/org/create
 *
 * Called at Step 1 of onboarding. Creates org + user + channel.
 *
 * Tries the authenticated bootstrap RPC first because it is the safest way to
 * create the first org for a newly signed-in user. Falls back to a verified
 * admin client only if the RPC has not been installed yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOptionalAdminClient } from "@/lib/supabase/admin";

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

function adminHint(reason: string): string {
  if (reason === "service_role_key_valid") return "Verified service role admin client active.";
  if (reason === "secret_key_valid") return "Verified Supabase secret key admin client active.";
  if (reason === "invalid_service_role_key") {
    return "SUPABASE_SERVICE_ROLE_KEY is set but is not a privileged Supabase key. In Vercel, use either the new sb_secret_... Secret key or the legacy service_role secret from the same Supabase project.";
  }
  if (reason === "missing_env") {
    return "SUPABASE_SERVICE_ROLE_KEY is missing. Add the Supabase sb_secret_... Secret key or legacy service_role secret in Vercel, or apply the bootstrap RPC migration.";
  }
  return "Supabase admin client could not be initialized.";
}

function onboardingRepairHint(adminReason: string, rpcError?: string) {
  const pieces = [
    adminHint(adminReason),
    "Run supabase/production-onboarding-repair.sql once in the Supabase SQL Editor for the project connected to NEXT_PUBLIC_SUPABASE_URL.",
  ];

  if (rpcError) {
    pieces.push(`Bootstrap RPC error: ${rpcError}`);
  }

  return pieces.join(" ");
}

async function tryBootstrapRpc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  body: CreateOrgBody
) {
  const { data, error } = await supabase.rpc("bootstrap_user_organization", {
    p_org_name: body.orgName,
    p_support_email: body.supportEmail ?? "",
    p_timezone: body.timezone ?? "America/New_York",
  });

  if (!error) return { data, error: null, missing: false };

  const missing =
    error.code === "PGRST202" ||
    error.message.toLowerCase().includes("could not find the function") ||
    error.message.toLowerCase().includes("schema cache");

  return { data: null, error, missing };
}

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized — please sign in first" }, { status: 401 });
    }

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

    // Prefer the authenticated bootstrap RPC. It is idempotent and runs as
    // SECURITY DEFINER, so it can create or repair the user's org/channel while
    // still requiring a real authenticated Supabase user.
    const rpcAttempt = await tryBootstrapRpc(supabase, body);
    if (rpcAttempt.data) {
      return NextResponse.json(rpcAttempt.data);
    }

    const adminState = createOptionalAdminClient();
    const admin = adminState.client;
    const db = admin ?? supabase;
    const usingAdmin = Boolean(admin);

    if (rpcAttempt.error && !rpcAttempt.missing) {
      console.warn(
        "[org/create] bootstrap RPC failed, trying admin fallback:",
        rpcAttempt.error.message,
        rpcAttempt.error.code
      );
    }

    // Check if user already has an org (idempotency)
    const { data: existingUser, error: existingUserErr } = await db
      .from("users")
      .select("id, org_id, role")
      .eq("auth_user_id", user.id)
      .single();

    if (existingUserErr && existingUserErr.code !== "PGRST116") {
      console.warn(
        "[org/create] existing user lookup failed:",
        existingUserErr.message,
        existingUserErr.code,
        adminState.reason
      );
    }

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
        adminStatus: adminState.reason,
      });
    }

    if (!usingAdmin) {
      return NextResponse.json({
        error: "Failed to create organization: bootstrap RPC is unavailable and no verified admin client is available.",
        hint: onboardingRepairHint(adminState.reason, rpcAttempt.error?.message),
        code: "missing_verified_admin",
        rpcError: rpcAttempt.error?.message,
      }, { status: 500 });
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
        hint: onboardingRepairHint(adminState.reason, rpcAttempt.error?.message),
        code: orgErr?.code,
        rpcError: rpcAttempt.error?.message,
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
        hint: adminHint(adminState.reason),
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
      adminStatus: adminState.reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[org/create] unhandled error:", message);
    return NextResponse.json({
      error: `Server error: ${message}`,
    }, { status: 500 });
  }
}
