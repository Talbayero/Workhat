import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/conversations/count
   Returns the count of open conversations for the authenticated user's org.
   Used by the sidebar badge to show pending queue size.
   Lightweight — only fetches a count, no rows. */

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (appUserError) return NextResponse.json({ error: appUserError.message }, { status: 500 });
  if (!appUser) return NextResponse.json({ open: 0 });

  const { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("org_id", (appUser as { org_id: string }).org_id)
    .not("status", "in", "(resolved,archived)");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ open: count ?? 0 });
}
