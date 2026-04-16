import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/search?q=term — cross-resource full-text search */

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, org_id")
    .eq("auth_user_id", user.id)
    .single();
  return data as { id: string; org_id: string } | null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ conversations: [], contacts: [], companies: [] });

  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const orgId = appUser.org_id;
  const pattern = `%${q}%`;

  const [convRes, contactRes, companyRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, subject, preview, status, last_message_at, contacts(full_name)")
      .eq("org_id", orgId)
      .or(`subject.ilike.${pattern},preview.ilike.${pattern}`)
      .order("last_message_at", { ascending: false })
      .limit(8),

    supabase
      .from("contacts")
      .select("id, full_name, email, tier, status")
      .eq("org_id", orgId)
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .order("last_activity_at", { ascending: false })
      .limit(8),

    supabase
      .from("companies")
      .select("id, name, domain, industry, tier")
      .eq("org_id", orgId)
      .or(`name.ilike.${pattern},domain.ilike.${pattern}`)
      .order("name", { ascending: true })
      .limit(8),
  ]);

  return NextResponse.json({
    conversations: convRes.data ?? [],
    contacts: contactRes.data ?? [],
    companies: companyRes.data ?? [],
  });
}
