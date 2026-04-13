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
import { createClient as createAdminClient } from "@supabase/supabase-js";

type InviteBody = {
  emails: string[];
  role: "agent" | "manager" | "qa_reviewer";
};

const VALID_ROLES = new Set(["agent", "manager", "qa_reviewer"]);

function validateBody(raw: unknown): InviteBody | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const emails = Array.isArray(obj.emails)
    ? obj.emails.filter((e): e is string => typeof e === "string" && e.includes("@"))
    : [];

  if (emails.length === 0) return null;
  if (!VALID_ROLES.has(obj.role as string)) return null;

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
    .single();

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

  // Admin client needed to send Supabase invite emails
  // (service role key bypasses RLS for the invite operation only)
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results: { email: string; status: "invited" | "already_exists" | "error" }[] = [];

  for (const email of emails) {
    // Check if a user with this email already exists in the org
    const { data: existing } = await supabase
      .from("users")
      .select("id, status")
      .eq("org_id", orgId)
      .eq("email", email)
      .single();

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
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?invite=1`;
    const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { redirectTo }
    );

    if (inviteErr) {
      console.error("[invite] supabase invite failed:", inviteErr.message);
      // Mark the pending row as error so it can be retried
      await supabase
        .from("users")
        .update({ status: "pending" })
        .eq("org_id", orgId)
        .eq("email", email);
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
