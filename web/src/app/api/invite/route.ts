/**
 * POST /api/invite
 *
 * Sends team member invitations. For each email:
 *   1. Creates a `users` row with status = 'pending'
 *   2. Sends a Supabase invite email (magic link tied to the org)
 *
 * Only admins and managers can invite. Duplicate invites are skipped gracefully.
 *
 * Note: all users table writes use the admin client because the RLS policy
 * users_insert_admin restricts inserts to admins, but managers are also
 * permitted to invite at the application layer. The admin client is safe here
 * because the app-layer role check runs before any DB write.
 */

import { NextRequest, NextResponse } from "next/server";
import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth/app-user";

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
  const caller = await getCurrentAppUser({ label: "invite", select: "id, org_id, role" });
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "manager"].includes(caller.role)) {
    return NextResponse.json(
      { error: "Only admins and managers can invite team members" },
      { status: 403 }
    );
  }

  const { org_id: orgId } = caller;

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

  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.error("[invite] admin client unavailable:", adminState.reason);
    return NextResponse.json(
      { error: "Invitations are unavailable — admin database key is not configured." },
      { status: 503 }
    );
  }
  const adminClient = adminState.client;

  const { emails, role } = body;
  const results: { email: string; status: "invited" | "already_exists" | "error" }[] = [];

  for (const email of emails) {
    // Check if a user with this email already exists in the org
    const { data: existing, error: existingError } = await adminClient
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

    // Create a pending users row so we know which org they belong to when they sign in.
    // Uses admin client because users_insert_admin RLS blocks non-admin inserts, but
    // managers are permitted to invite at the application layer (checked above).
    const { error: insertErr } = await adminClient.from("users").insert({
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
      const { error: cleanupError } = await adminClient
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
