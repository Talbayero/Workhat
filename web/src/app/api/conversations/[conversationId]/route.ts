import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* PATCH /api/conversations/:id — update status, priority, assignee, tags */

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .single();
  return data as { id: string; org_id: string; role: string } | null;
}

const VALID_STATUSES = new Set(["open", "waiting_on_customer", "in_progress", "resolved", "archived"]);
const VALID_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { conversationId } = await ctx.params;
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;

  const updates: Record<string, unknown> = {};

  if ("status" in body) {
    if (!VALID_STATUSES.has(body.status as string)) {
      return NextResponse.json({ error: "Invalid status value." }, { status: 422 });
    }
    updates.status = body.status;
  }

  if ("priority" in body) {
    if (!VALID_PRIORITIES.has(body.priority as string)) {
      return NextResponse.json({ error: "Invalid priority value." }, { status: 422 });
    }
    updates.priority = body.priority;
  }

  if ("assigned_to_name" in body) {
    updates.assigned_to_name = typeof body.assigned_to_name === "string"
      ? body.assigned_to_name.trim()
      : "";
  }

  if ("tags" in body) {
    updates.tags = Array.isArray(body.tags) ? body.tags : [];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update(updates)
    .eq("id", conversationId)
    .eq("org_id", appUser.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
