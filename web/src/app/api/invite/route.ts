/**
 * POST /api/invite
 *
 * Sends team member invitations. For each email:
 *   1. Creates a `users` row with status = 'pending'
 *   2. Sends a Supabase invite email (magic link tied to the org)
 *
 * Only admins and managers can invite. Duplicate invites are skipped gracefully.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type InviteBody = {
  emails: string[];
  role: "agent" | "manager" | "qa_reviewer";
};

const VALID_ROLES = new Set(["agent", "manager", "qa_reviewer"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INVITES_PER_REQUEST = 20;

function validateBody(raw: unknown): InviteBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const emails = Array.isArray(obj.emails)
    ? [...new Set(
        obj.emails
          .filter((e): e is string => typeof e === "string")
          .map((email) => email.trim().toLowerCase())
          .filter((email) => EMAIL_RE.test(email))
      )].slice(0, MAX_INVITES_PER_REQUEST)
    : [];

  if (emails.length === 0) return null;
  if (typeof obj.role !== "string" || !VALID_ROLES.has(obj.role)) return null;

  return { emails, role: obj.role as InviteBody["role"] };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Authenticate calling user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get calling user's app record — must be admin or manager
  const { data: caller, error: callerErr } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (callerErr || !caller) {
    return NextResponse.json({ error: "App user not found" }, { status: 403 });
  }

  const { org_id: orgId, role: callerRole } =
    caller as { id: string; org_id: string; role: string };

  if (!["admin", "manager"].includes(callerRole)) {
    return NextResponse.json(
      { error: "Only admins and managers can invite team members" },
      { status: 403 }
    );
  }

  // Validate body
  let body: InviteBody | null;
  try {
    body = validateBody(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json(
      { error: "emails (array) and role are required" },
      { status: 422 }
    );
  }

  const { emails, role } = body;

  // Use the shared admin client — includes key validation and proper error messages.
  // Avoids silently passing undefined if SUPABASE_SERVICE_ROLE_KEY is missing.
  let adminClient: ReturnType<typeof createAdminClient>;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[invite] admin client init failed:", message);
    return NextResponse.json(
      { error: "Invitations are unavailable — SUPABASE_SERVICE_ROLE_KEY is not configured." },
      { status: 503 }
    );
  }

  const results: { email: string; status: "invited" | "already_exists" | "error" }[] = [];

  for (const email of emails) {
    // Check if a user with this email already exists in the org
    const { data: existing, error: existingError } = await supabase
      .from("users")
      .select("id, status")
      .eq("org_id", orgId)
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      console.error("[invite] existing user lookup failed:", existingError.message);
      results.push({ email, status: "error" });
      continue;
    }

    if (existing) {
      results.push({ email, status: "already_exists" });
      continue;
    }

    // Create a pending users row so we know which org they belong to when they sign in
    const { error: insertErr } = await supabase.from("users").insert({
      org_id: orgId,
      auth_user_id: null, // filled in when they accept the invite
      full_name: email.split("@")[0],
      email,
      role,
      status: "pending",
    });

    if (insertErr) {
      console.error("[invite] pending user insert failed:", insertErr.message);
      results.push({ email, status: "error" });
      continue;
    }

    // Send Supabase invite email — this creates an auth user and sends a magic link
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
    const redirectTo = `${baseUrl}/auth/callback?invite=1`;
    const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { redirectTo }
    );

    if (inviteErr) {
      console.error("[invite] supabase invite failed:", inviteErr.message);
      // Delete the pending row so the invite can be cleanly retried.
      // user_status enum only has 'pending' | 'active' | 'disabled' — there is no
      // error state, so removing the row is cleaner than leaving a stuck ghost record.
      const { error: cleanupError } = await supabase
        .from("users")
        .delete()
        .eq("org_id", orgId)
        .eq("email", email)
        .eq("status", "pending");
      if (cleanupError) {
        console.warn("[invite] failed to cleanup pending invite:", cleanupError.message);
      }
      results.push({ email, status: "error" });
    } else {
      results.push({ email, status: "invited" });
    }
  }

  const invited = results.filter((r) => r.status === "invited").length;
  const skipped = results.filter((r) => r.status === "already_exists").length;
  const failed = results.filter((r) => r.status === "error").length;

  return NextResponse.json({ results, invited, skipped, failed });
}
