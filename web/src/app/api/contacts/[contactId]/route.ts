import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ─────────────────────────────────────────────
   PATCH  /api/contacts/:id — update contact
   DELETE /api/contacts/:id — delete contact
───────────────────────────────────────────── */

function normalizeOptionalString(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function normalizeTags(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    return null;
  }

  return [...new Set(value.map((tag) => tag.trim()).filter(Boolean))];
}

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

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = {};

  for (const key of [
    "first_name",
    "last_name",
    "email",
    "phone",
    "tier",
    "status",
    "notes",
    "preferred_channel",
    "location",
    "lifecycle_stage",
  ] as const) {
    if (key in body) {
      const value = normalizeOptionalString(body[key]);
      if (value === undefined) return NextResponse.json({ error: `${key} must be text.` }, { status: 400 });
      updates[key] = value;
    }
  }

  if ("tags" in body) {
    const tags = normalizeTags(body.tags);
    if (tags === null) return NextResponse.json({ error: "Tags must be a list of text values." }, { status: 400 });
    updates.tags = tags;
  }

  // Keep full_name in sync
  if ("first_name" in updates || "last_name" in updates) {
    const { data: current, error: currentError } = await supabase
      .from("contacts")
      .select("first_name, last_name")
      .eq("id", contactId)
      .eq("org_id", appUser.org_id)
      .maybeSingle();

    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "Contact not found for this workspace." }, { status: 404 });

    const fn = (updates.first_name ?? current?.first_name ?? "") as string;
    const ln = (updates.last_name ?? current?.last_name ?? "") as string;
    updates.full_name = [fn, ln].filter(Boolean).join(" ") || "Unknown";
  }

  if ("company_id" in body) {
    const companyId = typeof body.company_id === "string" ? body.company_id.trim() : body.company_id;

    if (!companyId) {
      updates.company_id = null;
    } else if (typeof companyId === "string") {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .eq("id", companyId)
        .eq("org_id", appUser.org_id)
        .maybeSingle();

      if (companyError) {
        return NextResponse.json({ error: companyError.message }, { status: 500 });
      }

      if (!company) {
        return NextResponse.json({ error: "Company not found for this workspace." }, { status: 400 });
      }

      updates.company_id = companyId;
    } else {
      return NextResponse.json({ error: "Invalid company value." }, { status: 400 });
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", contactId)
    .eq("org_id", appUser.org_id)
    .select("id")
    .maybeSingle();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  if (!data) return NextResponse.json({ error: "Contact not found for this workspace." }, { status: 404 });

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
  const { data, error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", contactId)
    .eq("org_id", appUser.org_id)
    .select("id")
    .maybeSingle();

  if (error) {
    const status = error.code === "23503" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  if (!data) return NextResponse.json({ error: "Contact not found for this workspace." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
