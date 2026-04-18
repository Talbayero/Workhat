/**
 * GET  /api/settings/team             — list all users in the org
 * POST /api/settings/team             — invite a single user (wraps /api/invite)
 * PATCH /api/settings/team?userId=:id — update a user's role or skills
 * DELETE /api/settings/team?userId=:id — remove a user from the org
 *
 * Only admins can remove users or change roles.
 * Managers can update agent skills.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth/app-user";

const VALID_ROLES = new Set(["agent", "manager", "qa_reviewer", "admin"]);

async function countAdmins(orgId: string) {
  // Use admin client so the count isn't filtered by the caller's own RLS context
  const adminState = createOptionalAdminClient();
  if (!adminState.client) return null;

  const { count, error } = await adminState.client
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "admin")
    .neq("status", "disabled");

  if (error) {
    console.error("[settings/team] admin count failed:", error.message);
    return null;
  }

  return count ?? 0;
}

// ── GET — list team ───────────────────────────────────────────────────────────

export async function GET() {
  const caller = await getCurrentAppUser({ label: "settings/team", select: "id, org_id, role" });
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
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

// ── PATCH — update role or skills ─────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const caller = await getCurrentAppUser({ label: "settings/team", select: "id, org_id, role" });
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 422 });

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

  // ── Skills update — managers+ can patch skills ────────────────────────────
  if ("skills" in body) {
    if (!["admin", "manager"].includes(caller.role)) {
      return NextResponse.json({ error: "Only managers can update skills" }, { status: 403 });
    }
    const skills = body.skills;
    if (!Array.isArray(skills)) {
      return NextResponse.json({ error: "skills must be an array" }, { status: 422 });
    }
    if (skills.length > 20) {
      return NextResponse.json({ error: "Maximum 20 skills per agent" }, { status: 422 });
    }
    for (const s of skills) {
      if (typeof s !== "object" || s === null) {
        return NextResponse.json({ error: "Each skill must be an object with name and priority" }, { status: 422 });
      }
      const sk = s as Record<string, unknown>;
      if (typeof sk.name !== "string" || !sk.name.trim()) {
        return NextResponse.json({ error: "Each skill must have a non-empty name" }, { status: 422 });
      }
      if (typeof sk.priority !== "number" || !Number.isInteger(sk.priority) || sk.priority < 1 || sk.priority > 5) {
        return NextResponse.json({ error: "Skill priority must be an integer between 1 and 5" }, { status: 422 });
      }
    }

    const normalizedSkills = skills.map((skill) => {
      const value = skill as Record<string, unknown>;
      return {
        name: (value.name as string).trim(),
        priority: value.priority as number,
      };
    });

    // Skills writes use admin client because users_update_admin RLS only allows
    // admins, but the app-layer grants managers permission for skills updates.
    const adminState = createOptionalAdminClient();
    if (!adminState.client) {
      console.error("[settings/team] admin client unavailable:", adminState.reason);
      return NextResponse.json({ error: "Team management is temporarily unavailable." }, { status: 503 });
    }

    const { data: skillTarget, error: targetError } = await adminState.client
      .from("users")
      .select("id")
      .eq("id", userId)
      .eq("org_id", caller.org_id)
      .maybeSingle();

    if (targetError) return NextResponse.json({ error: "Failed to verify user" }, { status: 500 });
    if (!skillTarget) return NextResponse.json({ error: "User not found in org" }, { status: 404 });

    const { error: updateError } = await adminState.client
      .from("users")
      .update({ skills: normalizedSkills })
      .eq("id", userId)
      .eq("org_id", caller.org_id);

    if (updateError) return NextResponse.json({ error: "Failed to update skills" }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  // ── Role update — admins only ─────────────────────────────────────────────
  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can change roles" }, { status: 403 });
  }

  if (typeof body.role !== "string" || !VALID_ROLES.has(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 422 });
  }

  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.error("[settings/team] admin client unavailable:", adminState.reason);
    return NextResponse.json({ error: "Team management is temporarily unavailable." }, { status: 503 });
  }

  // Verify the target user belongs to the same org
  const { data: target, error: targetError } = await adminState.client
    .from("users")
    .select("id, role")
    .eq("id", userId)
    .eq("org_id", caller.org_id)
    .maybeSingle();

  if (targetError) return NextResponse.json({ error: "Failed to verify user" }, { status: 500 });
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

  if (target.role === "admin" && body.role !== "admin") {
    const adminCount = await countAdmins(caller.org_id);
    if (adminCount === null) return NextResponse.json({ error: "Failed to verify admin coverage" }, { status: 500 });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "At least one admin must remain in the workspace." }, { status: 400 });
    }
  }

  const { error: updateError } = await adminState.client
    .from("users")
    .update({ role: body.role })
    .eq("id", userId)
    .eq("org_id", caller.org_id);

  if (updateError) return NextResponse.json({ error: "Failed to update role" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// ── DELETE — remove user ──────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const caller = await getCurrentAppUser({ label: "settings/team", select: "id, org_id, role" });
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

  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.error("[settings/team] admin client unavailable:", adminState.reason);
    return NextResponse.json({ error: "Team management is temporarily unavailable." }, { status: 503 });
  }

  const { data: target, error: targetError } = await adminState.client
    .from("users")
    .select("id, role")
    .eq("id", userId)
    .eq("org_id", caller.org_id)
    .maybeSingle();

  if (targetError) return NextResponse.json({ error: "Failed to verify user" }, { status: 500 });
  if (!target) return NextResponse.json({ error: "User not found in org" }, { status: 404 });

  if (target.role === "admin") {
    const adminCount = await countAdmins(caller.org_id);
    if (adminCount === null) return NextResponse.json({ error: "Failed to verify admin coverage" }, { status: 500 });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "At least one admin must remain in the workspace." }, { status: 400 });
    }
  }

  const { error } = await adminState.client
    .from("users")
    .delete()
    .eq("id", userId)
    .eq("org_id", caller.org_id);

  if (error) {
    return NextResponse.json({ error: "Failed to remove user" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
