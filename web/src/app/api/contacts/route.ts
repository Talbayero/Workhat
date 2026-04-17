import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ─────────────────────────────────────────────
   POST /api/contacts — create contact
───────────────────────────────────────────── */

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("id, org_id, role").eq("auth_user_id", user.id).single();
  return data as { id: string; org_id: string; role: string } | null;
}

export async function POST(req: NextRequest) {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    firstName?: string; lastName?: string; email?: string; phone?: string;
    companyId?: string; tier?: string; notes?: string; tags?: string[];
  };

  const firstName = body.firstName?.trim() ?? "";
  const lastName = body.lastName?.trim() ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
  const email = body.email?.trim().toLowerCase() || null;

  if (!firstName && !email) {
    return NextResponse.json({ error: "First name or email is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const companyId = body.companyId?.trim() || null;

  if (companyId) {
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
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      org_id: appUser.org_id,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      email,
      phone: body.phone?.trim() || null,
      company_id: companyId,
      tier: body.tier || null,
      status: "active",
      notes: body.notes?.trim() || null,
      tags: body.tags ?? [],
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A contact with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contact: { id: data.id } }, { status: 201 });
}
