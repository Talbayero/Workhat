import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { createClient } from "@/lib/supabase/server";

/* ─────────────────────────────────────────────
   POST /api/contacts — create contact
───────────────────────────────────────────── */

const CONTACT_TIERS = new Set(["standard", "pro", "enterprise", "vip"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

async function refreshCompanyContactCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  companyId: string | null
) {
  if (!companyId) return;

  const { count, error: countError } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("company_id", companyId);

  if (countError) {
    console.error("[contacts] company contact count failed:", countError.message);
    return;
  }

  const { error: updateError } = await supabase
    .from("companies")
    .update({ active_contacts: count ?? 0 })
    .eq("id", companyId)
    .eq("org_id", orgId);

  if (updateError) {
    console.error("[contacts] company contact count update failed:", updateError.message);
  }
}

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "contacts" });
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

  const rawFirstName = normalizeOptionalString(body.firstName);
  const rawLastName = normalizeOptionalString(body.lastName);
  const rawEmail = normalizeOptionalString(body.email);
  const phone = normalizeOptionalString(body.phone);
  const notes = normalizeOptionalString(body.notes);
  const tier = normalizeOptionalString(body.tier);
  const tags = normalizeTags(body.tags);

  if (rawFirstName === undefined) return NextResponse.json({ error: "First name must be text." }, { status: 400 });
  if (rawLastName === undefined) return NextResponse.json({ error: "Last name must be text." }, { status: 400 });
  if (rawEmail === undefined) return NextResponse.json({ error: "Email must be text." }, { status: 400 });
  if (phone === undefined) return NextResponse.json({ error: "Phone must be text." }, { status: 400 });
  if (notes === undefined) return NextResponse.json({ error: "Notes must be text." }, { status: 400 });
  if (tier === undefined) return NextResponse.json({ error: "Tier must be text." }, { status: 400 });
  if (tags === null) return NextResponse.json({ error: "Tags must be a list of text values." }, { status: 400 });

  const firstName = rawFirstName ?? "";
  const lastName = rawLastName ?? "";
  const email = rawEmail?.toLowerCase() ?? null;

  if (email && !EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (tier && !CONTACT_TIERS.has(tier)) return NextResponse.json({ error: "Invalid contact tier." }, { status: 400 });

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";

  if (!firstName && !email) {
    return NextResponse.json({ error: "First name or email is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const companyIdValue = normalizeOptionalString(body.companyId ?? body.company_id);
  if (companyIdValue === undefined) {
    return NextResponse.json({ error: "Company value must be text." }, { status: 400 });
  }
  const companyId = companyIdValue || null;

  if (companyId) {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("id", companyId)
      .eq("org_id", appUser.org_id)
      .maybeSingle();

    if (companyError) {
      console.error("[contacts] company lookup failed:", companyError.message);
      return NextResponse.json({ error: "Unable to verify this company." }, { status: 500 });
    }

    if (!company) {
      return NextResponse.json({ error: "Company not found for this workspace." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      org_id: appUser.org_id,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      email,
      phone,
      company_id: companyId,
      tier,
      status: "active",
      notes,
      tags,
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "A contact with this email already exists." }, { status: 409 });
    }
    console.error("[contacts] contact insert failed:", error?.message ?? "No contact returned");
    return NextResponse.json({ error: "Unable to create this contact." }, { status: 500 });
  }

  await refreshCompanyContactCount(supabase, appUser.org_id, companyId);

  return NextResponse.json({ contact: { id: data.id } }, { status: 201 });
}
