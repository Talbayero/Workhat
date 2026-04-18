import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/companies — create company */

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
    console.error("[companies] app user lookup failed:", error.message);
    return null;
  }

  return data as { id: string; org_id: string; role: string } | null;
}

export async function POST(req: NextRequest) {
  const appUser = await getAppUser();
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

  const name = normalizeOptionalString(body.name);
  if (!name) return NextResponse.json({ error: "Company name is required." }, { status: 400 });

  const domain = normalizeOptionalString(body.domain);
  const industry = normalizeOptionalString(body.industry);
  const notes = normalizeOptionalString(body.notes);
  const tier = normalizeOptionalString(body.tier) ?? "standard";
  const tags = normalizeTags(body.tags);

  if (domain === undefined) return NextResponse.json({ error: "Domain must be text." }, { status: 400 });
  if (industry === undefined) return NextResponse.json({ error: "Industry must be text." }, { status: 400 });
  if (notes === undefined) return NextResponse.json({ error: "Notes must be text." }, { status: 400 });
  if (tags === null) return NextResponse.json({ error: "Tags must be a list of text values." }, { status: 400 });
  if (domain && !DOMAIN_RE.test(domain)) return NextResponse.json({ error: "Enter a valid company domain." }, { status: 400 });
  if (!COMPANY_TIERS.has(tier)) return NextResponse.json({ error: "Invalid company tier." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .insert({
      org_id: appUser.org_id,
      name,
      domain: domain?.toLowerCase() || null,
      industry,
      tier,
      notes,
      tags,
      open_conversations: 0,
      active_contacts: 0,
    })
    .select("id")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ company: { id: data.id } }, { status: 201 });
}
