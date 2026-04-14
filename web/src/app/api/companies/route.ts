import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/companies — create company */

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

  const body = await req.json() as { name?: string; domain?: string; industry?: string; tier?: string; notes?: string; tags?: string[] };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Company name is required." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .insert({
      org_id: appUser.org_id,
      name,
      domain: body.domain?.trim().toLowerCase() || null,
      industry: body.industry?.trim() || null,
      tier: body.tier || "standard",
      notes: body.notes?.trim() || null,
      tags: body.tags ?? [],
      open_conversations: 0,
      active_contacts: 0,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ company: { id: data.id } }, { status: 201 });
}
