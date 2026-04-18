import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";

/* GET /api/conversations/count
   Returns the count of open conversations for the authenticated user's org.
   Used by the sidebar badge to show pending queue size.
   Lightweight — only fetches a count, no rows. */

export async function GET() {
  const appUser = await getCurrentAppUser({ label: "conversations/count", select: "org_id" });
  if (!appUser) return NextResponse.json({ open: 0 });

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("org_id", appUser.org_id)
    .not("status", "in", "(resolved,archived)");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ open: count ?? 0 });
}
