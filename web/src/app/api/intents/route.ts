import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateIntentCache } from "@/lib/ai/intent-classifier";

/* ─────────────────────────────────────────────
   GET  /api/intents  — list org intents
   POST /api/intents  — create intent (manager+)
───────────────────────────────────────────── */

const VALID_PRIORITY_LEVELS = new Set(["high", "normal", "low"]);

function normalizeKeywords(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((keyword) => typeof keyword !== "string")) {
    return null;
  }

  return [...new Set(value.map((keyword) => keyword.trim()).filter(Boolean))];
}

function normalizeOptionalString(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[intents] app user lookup failed:", error.message);
    return null;
  }

  return data as { id: string; org_id: string; role: string } | null;
}

export async function GET() {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[intents] admin client init failed:", message);
    return NextResponse.json(
      { error: "Intent settings are unavailable — admin database key is not configured." },
      { status: 503 }
    );
  }

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

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = normalizeOptionalString(body.name);
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const color = normalizeOptionalString(body.color);
  if (color === undefined) return NextResponse.json({ error: "color must be text" }, { status: 400 });

  const skillRequired = normalizeOptionalString(body.skill_required);
  if (skillRequired === undefined) return NextResponse.json({ error: "skill_required must be text" }, { status: 400 });

  const keywords = normalizeKeywords(body.keywords);
  if (keywords === null) return NextResponse.json({ error: "keywords must be a list of text values" }, { status: 400 });

  const priorityOrder = body.priority_order;
  if (priorityOrder !== undefined && (typeof priorityOrder !== "number" || !Number.isFinite(priorityOrder))) {
    return NextResponse.json({ error: "priority_order must be a finite number" }, { status: 400 });
  }

  let priorityLevel = "normal";
  if (body.priority_level !== undefined) {
    if (typeof body.priority_level !== "string" || !VALID_PRIORITY_LEVELS.has(body.priority_level)) {
      return NextResponse.json({ error: "priority_level must be high, normal, or low" }, { status: 400 });
    }
    priorityLevel = body.priority_level;
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[intents] admin client init failed:", message);
    return NextResponse.json(
      { error: "Intent settings are unavailable — admin database key is not configured." },
      { status: 503 }
    );
  }

  const { data, error } = await admin
    .from("intents")
    .insert({
      org_id: appUser.org_id,
      name,
      color: color || "#78a17a",
      keywords,
      skill_required: skillRequired,
      priority_order: typeof priorityOrder === "number" ? priorityOrder : 100,
      priority_level: priorityLevel,
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
