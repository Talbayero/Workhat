import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/search?q=term — cross-resource full-text search */

const MAX_SEARCH_LENGTH = 80;

type SearchRecord = { id: string };

function buildSearchPattern(query: string) {
  const clipped = query.slice(0, MAX_SEARCH_LENGTH);
  const escaped = clipped.replace(/[\\%_]/g, (value) => `\\${value}`);
  return `%${escaped}%`;
}

function mergeById<T extends SearchRecord>(...groups: Array<T[] | null | undefined>) {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const group of groups) {
    for (const item of group ?? []) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }

  return merged;
}

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, org_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[search] app user lookup failed:", error.message);
    return null;
  }
  return data as { id: string; org_id: string } | null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ conversations: [], contacts: [], companies: [] });

  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const orgId = appUser.org_id;
  const pattern = buildSearchPattern(q);

  const [
    convSubjectRes,
    convPreviewRes,
    contactNameRes,
    contactEmailRes,
    companyNameRes,
    companyDomainRes,
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, subject, preview, status, last_message_at, contacts(full_name)")
      .eq("org_id", orgId)
      .ilike("subject", pattern)
      .order("last_message_at", { ascending: false })
      .limit(8),

    supabase
      .from("conversations")
      .select("id, subject, preview, status, last_message_at, contacts(full_name)")
      .eq("org_id", orgId)
      .ilike("preview", pattern)
      .order("last_message_at", { ascending: false })
      .limit(8),

    supabase
      .from("contacts")
      .select("id, full_name, email, tier, status")
      .eq("org_id", orgId)
      .ilike("full_name", pattern)
      .order("last_activity_at", { ascending: false })
      .limit(8),

    supabase
      .from("contacts")
      .select("id, full_name, email, tier, status")
      .eq("org_id", orgId)
      .ilike("email", pattern)
      .order("last_activity_at", { ascending: false })
      .limit(8),

    supabase
      .from("companies")
      .select("id, name, domain, industry, tier")
      .eq("org_id", orgId)
      .ilike("name", pattern)
      .order("name", { ascending: true })
      .limit(8),

    supabase
      .from("companies")
      .select("id, name, domain, industry, tier")
      .eq("org_id", orgId)
      .ilike("domain", pattern)
      .order("name", { ascending: true })
      .limit(8),
  ]);

  const failedResult = [
    convSubjectRes,
    convPreviewRes,
    contactNameRes,
    contactEmailRes,
    companyNameRes,
    companyDomainRes,
  ].find((result) => result.error);

  if (failedResult?.error) {
    return NextResponse.json({ error: failedResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    conversations: mergeById(convSubjectRes.data, convPreviewRes.data).slice(0, 8),
    contacts: mergeById(contactNameRes.data, contactEmailRes.data).slice(0, 8),
    companies: mergeById(companyNameRes.data, companyDomainRes.data).slice(0, 8),
  });
}
