import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ─────────────────────────────────────────────
   PATCH  /api/contacts/:id — update contact
   DELETE /api/contacts/:id — delete contact
───────────────────────────────────────────── */

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("id, org_id, role").eq("auth_user_id", user.id).single();
  return data as { id: string; org_id: string; role: string } | null;
}

type RouteContext = { params: Promise<{ contactId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { contactId } = await ctx.params;
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  const allowed = ["first_name", "last_name", "email", "phone", "company_id", "tier", "status", "notes", "tags", "preferred_channel", "location", "lifecycle_stage"];
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Keep full_name in sync
  if ("first_name" in updates || "last_name" in updates) {
    const { data: current } = await supabase.from("contacts").select("first_name, last_name").eq("id", contactId).eq("org_id", appUser.org_id).single();
    const fn = (updates.first_name ?? current?.first_name ?? "") as string;
    const ln = (updates.last_name ?? current?.last_name ?? "") as string;
    updates.full_name = [fn, ln].filter(Boolean).join(" ") || "Unknown";
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", contactId)
    .eq("org_id", appUser.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { contactId } = await ctx.params;
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "manager"].includes(appUser.role)) {
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", contactId)
    .eq("org_id", appUser.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
