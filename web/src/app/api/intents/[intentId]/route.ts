import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateIntentCache } from "@/lib/ai/intent-classifier";

/* ─────────────────────────────────────────────
   PATCH  /api/intents/:id  — update intent
   DELETE /api/intents/:id  — delete intent
   Both require manager or admin role.
───────────────────────────────────────────── */

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ intentId: string }> }
) {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "admin"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden — managers only" }, { status: 403 });
  }

  const { intentId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const allowed = ["name", "color", "keywords", "skill_required", "priority_order", "priority_level"];
  const patch: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in body) {
      if (key === "name" && typeof body.name === "string") patch.name = body.name.trim();
      else if (key === "color" && typeof body.color === "string") patch.color = body.color.trim();
      else if (key === "keywords" && Array.isArray(body.keywords)) {
        patch.keywords = (body.keywords as string[]).map((k) => k.trim()).filter(Boolean);
      }
      else if (key === "skill_required") patch.skill_required = body.skill_required || null;
      else if (key === "priority_order" && typeof body.priority_order === "number") patch.priority_order = body.priority_order;
      else if (key === "priority_level") {
        const validLevels = ["high", "normal", "low"];
        if (validLevels.includes(body.priority_level as string)) patch.priority_level = body.priority_level;
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("intents")
    .update(patch)
    .eq("id", intentId)
    .eq("org_id", appUser.org_id)
    .select("id, name, color, keywords, skill_required, priority_order, priority_level, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An intent with that name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Intent not found" }, { status: 404 });

  invalidateIntentCache(appUser.org_id);
  return NextResponse.json({ intent: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ intentId: string }> }
) {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "admin"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden — managers only" }, { status: 403 });
  }

  const { intentId } = await params;

  const admin = createAdminClient();
  const { error, count } = await admin
    .from("intents")
    .delete({ count: "exact" })
    .eq("id", intentId)
    .eq("org_id", appUser.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (count === 0) return NextResponse.json({ error: "Intent not found" }, { status: 404 });

  invalidateIntentCache(appUser.org_id);
  return NextResponse.json({ ok: true });
}
