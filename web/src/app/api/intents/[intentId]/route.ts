import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateIntentCache } from "@/lib/ai/intent-classifier";
import { getCurrentAppUser } from "@/lib/auth/app-user";

/* ─────────────────────────────────────────────
   PATCH  /api/intents/:id  — update intent
   DELETE /api/intents/:id  — delete intent
   Both require manager or admin role.
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ intentId: string }> }
) {
  const appUser = await getCurrentAppUser({ label: "intents/:id", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "admin"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden — managers only" }, { status: 403 });
  }

  const { intentId } = await params;

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

  const allowed = ["name", "color", "keywords", "skill_required", "priority_order", "priority_level"];
  const patch: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in body) {
      if (key === "name") {
        const name = normalizeOptionalString(body.name);
        if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
        patch.name = name;
      }
      else if (key === "color") {
        const color = normalizeOptionalString(body.color);
        if (color === undefined) return NextResponse.json({ error: "color must be text" }, { status: 400 });
        patch.color = color || "#78a17a";
      }
      else if (key === "keywords") {
        const keywords = normalizeKeywords(body.keywords);
        if (keywords === null) return NextResponse.json({ error: "keywords must be a list of text values" }, { status: 400 });
        patch.keywords = keywords;
      }
      else if (key === "skill_required") {
        const skillRequired = normalizeOptionalString(body.skill_required);
        if (skillRequired === undefined) return NextResponse.json({ error: "skill_required must be text" }, { status: 400 });
        patch.skill_required = skillRequired;
      }
      else if (key === "priority_order") {
        if (typeof body.priority_order !== "number" || !Number.isFinite(body.priority_order)) {
          return NextResponse.json({ error: "priority_order must be a finite number" }, { status: 400 });
        }
        patch.priority_order = body.priority_order;
      }
      else if (key === "priority_level") {
        if (typeof body.priority_level !== "string" || !VALID_PRIORITY_LEVELS.has(body.priority_level)) {
          return NextResponse.json({ error: "priority_level must be high, normal, or low" }, { status: 400 });
        }
        patch.priority_level = body.priority_level;
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[intents/:id] admin client init failed:", message);
    return NextResponse.json(
      { error: "Intent settings are unavailable — admin database key is not configured." },
      { status: 503 }
    );
  }

  const { data, error } = await admin
    .from("intents")
    .update(patch)
    .eq("id", intentId)
    .eq("org_id", appUser.org_id)
    .select("id, name, color, keywords, skill_required, priority_order, priority_level, created_at")
    .maybeSingle();

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
  const appUser = await getCurrentAppUser({ label: "intents/:id", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "admin"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden — managers only" }, { status: 403 });
  }

  const { intentId } = await params;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[intents/:id] admin client init failed:", message);
    return NextResponse.json(
      { error: "Intent settings are unavailable — admin database key is not configured." },
      { status: 503 }
    );
  }

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
