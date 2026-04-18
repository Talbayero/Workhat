import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { createClient } from "@/lib/supabase/server";

/* PATCH/DELETE /api/companies/:id */

const COMPANY_TIERS = new Set(["standard", "pro", "enterprise", "vip"]);
const DOMAIN_RE = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;

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

type RouteContext = { params: Promise<{ companyId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { companyId } = await ctx.params;
  if (!companyId?.trim()) {
    return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  }

  const appUser = await getCurrentAppUser({ label: "companies/:id" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = {};

  if ("name" in body) {
    const name = normalizeOptionalString(body.name);
    if (!name) return NextResponse.json({ error: "Company name cannot be empty." }, { status: 400 });
    updates.name = name;
  }

  if ("domain" in body) {
    const domain = normalizeOptionalString(body.domain);
    if (domain === undefined) return NextResponse.json({ error: "Domain must be text." }, { status: 400 });
    if (domain && !DOMAIN_RE.test(domain)) return NextResponse.json({ error: "Enter a valid company domain." }, { status: 400 });
    updates.domain = domain?.toLowerCase() || null;
  }

  for (const key of ["industry", "notes", "account_owner"] as const) {
    if (key in body) {
      const value = normalizeOptionalString(body[key]);
      if (value === undefined) return NextResponse.json({ error: `${key} must be text.` }, { status: 400 });
      updates[key] = value;
    }
  }

  if ("tier" in body) {
    const tier = normalizeOptionalString(body.tier);
    if (tier === undefined) return NextResponse.json({ error: "Tier must be text." }, { status: 400 });
    if (tier && !COMPANY_TIERS.has(tier)) return NextResponse.json({ error: "Invalid company tier." }, { status: 400 });
    updates.tier = tier ?? "standard";
  }

  if ("tags" in body) {
    const tags = normalizeTags(body.tags);
    if (tags === null) return NextResponse.json({ error: "Tags must be a list of text values." }, { status: 400 });
    updates.tags = tags;
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No fields to update." }, { status: 400 });

  const { data, error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", companyId)
    .eq("org_id", appUser.org_id)
    .select("id")
    .maybeSingle();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = error.code === "23505" ? "A company with this domain already exists." : "Unable to update this company.";
    if (status === 500) console.error("[companies/:id] company update failed:", error.message);
    return NextResponse.json({ error: message }, { status });
  }

  if (!data) return NextResponse.json({ error: "Company not found for this workspace." }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { companyId } = await ctx.params;
  if (!companyId?.trim()) {
    return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  }

  const appUser = await getCurrentAppUser({ label: "companies/:id" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "manager"].includes(appUser.role)) {
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .delete()
    .eq("id", companyId)
    .eq("org_id", appUser.org_id)
    .select("id")
    .maybeSingle();

  if (error) {
    const status = error.code === "23503" ? 409 : 500;
    const message = error.code === "23503" ? "This company still has linked records." : "Unable to delete this company.";
    if (status === 500) console.error("[companies/:id] company delete failed:", error.message);
    return NextResponse.json({ error: message }, { status });
  }

  if (!data) return NextResponse.json({ error: "Company not found for this workspace." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
