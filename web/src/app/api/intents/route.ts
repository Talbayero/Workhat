import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateIntentCache } from "@/lib/ai/intent-classifier";

/* ─────────────────────────────────────────────
   GET  /api/intents  — list org intents
   POST /api/intents  — create intent (manager+)
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

export async function GET() {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("intents")
    .select("id, name, color, keywords, skill_required, priority_order, priority_level, created_at")
    .eq("org_id", appUser.org_id)
    .order("priority_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ intents: data ?? [] });
}

export async function POST(req: NextRequest) {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "admin"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden — managers only" }, { status: 403 });
  }

  let body: {
    name?: string;
    color?: string;
    keywords?: string[];
    skill_required?: string;
    priority_order?: number;
    priority_level?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const validLevels = ["high", "normal", "low"];
  const priority_level = validLevels.includes(body.priority_level ?? "")
    ? body.priority_level
    : "normal";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("intents")
    .insert({
      org_id: appUser.org_id,
      name,
      color: body.color?.trim() || "#78a17a",
      keywords: Array.isArray(body.keywords) ? body.keywords.map((k: string) => k.trim()).filter(Boolean) : [],
      skill_required: body.skill_required?.trim() || null,
      priority_order: typeof body.priority_order === "number" ? body.priority_order : 100,
      priority_level,
    })
    .select("id, name, color, keywords, skill_required, priority_order, priority_level, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An intent with that name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateIntentCache(appUser.org_id);
  return NextResponse.json({ intent: data }, { status: 201 });
}
