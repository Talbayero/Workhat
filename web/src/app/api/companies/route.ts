import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { createClient } from "@/lib/supabase/server";

/* POST /api/companies — create company */

const COMPANY_TIERS = new Set(["standard", "pro", "enterprise", "vip"]);
const DOMAIN_RE = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;
const MAX_NAME_LENGTH = 200;
const MAX_INDUSTRY_LENGTH = 100;
const MAX_NOTES_LENGTH = 2000;
const MAX_TAG_COUNT = 20;
const MAX_TAG_LENGTH = 50;

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

  const tags = [...new Set(value.map((tag) => (tag as string).trim()).filter(Boolean))];
  if (tags.length > MAX_TAG_COUNT) return null;
  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) return null;
  return tags;
}

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "companies" });
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
  if (tags === null) return NextResponse.json({ error: `Tags must be a list of text values (max ${MAX_TAG_COUNT} tags, each max ${MAX_TAG_LENGTH} characters).` }, { status: 400 });
  if (domain && !DOMAIN_RE.test(domain)) return NextResponse.json({ error: "Enter a valid company domain." }, { status: 400 });
  if (!COMPANY_TIERS.has(tier)) return NextResponse.json({ error: "Invalid company tier." }, { status: 400 });

  if (name.length > MAX_NAME_LENGTH) return NextResponse.json({ error: "Company name is too long." }, { status: 422 });
  if (industry && industry.length > MAX_INDUSTRY_LENGTH) return NextResponse.json({ error: "Industry is too long." }, { status: 422 });
  if (notes && notes.length > MAX_NOTES_LENGTH) return NextResponse.json({ error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.` }, { status: 422 });

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

  if (error || !data) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "A company with this domain already exists." }, { status: 409 });
    }
    console.error("[companies] company insert failed:", error?.message ?? "No company returned");
    return NextResponse.json({ error: "Unable to create this company." }, { status: 500 });
  }

  return NextResponse.json({ company: { id: data.id } }, { status: 201 });
}
