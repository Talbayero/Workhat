/**
 * GET  /api/settings/team             — list all users in the org
 * POST /api/settings/team             — invite a single user (wraps /api/invite)
 * PATCH /api/settings/team?userId=:id — update a user's role
 * DELETE /api/settings/team?userId=:id — remove a user from the org
 *
 * Only admins can remove users or change roles.
 * Managers can invite new agents/reviewers.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_ROLES = new Set(["agent", "manager", "qa_reviewer", "admin"]);

async function getCallerAndOrg(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .single();
  return data as { id: string; org_id: string; role: string } | null;
}

// ── GET — list team ───────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient();
  const caller = await getCallerAndOrg(supabase);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: members, error } = await supabase
    .from("users")
    .select("id, full_name, email, role, status, created_at")
    .eq("org_id", caller.org_id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
  }

  return NextResponse.json({ members: members ?? [] });
}

// ── PATCH — update role ───────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const caller = await getCallerAndOrg(supabase);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can change roles" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 422 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_ROLES.has(body.role as string)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 422 });
  }

  // Verify the target user belongs to the same org
  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("org_id", caller.org_id)
    .single();

  if (!target) {
    return NextResponse.json({ error: "User not found in org" }, { status: 404 });
  }

  // Prevent admin from demoting themselves
  if (userId === caller.id && body.role !== "admin") {
    return NextResponse.json(
      { error: "You cannot change your own role. Have another admin do this." },
      { status: 400 }
    );
  }

  await supabase
    .from("users")
    .update({ role: body.role })
    .eq("id", userId)
    .eq("org_id", caller.org_id);

  return NextResponse.json({ ok: true });
}

// ── DELETE — remove user ──────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const caller = await getCallerAndOrg(supabase);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can remove team members" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 422 });

  if (userId === caller.id) {
    return NextResponse.json({ error: "You cannot remove yourself from the org" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .delete()
    .eq("id", userId)
    .eq("org_id", caller.org_id);

  if (error) {
    return NextResponse.json({ error: "Failed to remove user" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
