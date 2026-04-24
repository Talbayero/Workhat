import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { createOptionalAdminClient } from "@/lib/supabase/admin";

/* GET /api/conversations/count
   Returns the count of open conversations for the authenticated user's org.
   Used by the sidebar badge to show pending queue size.
   Lightweight — only fetches a count, no rows. */

export async function GET() {
  const appUser = await getCurrentAppUser({ label: "conversations/count", select: "org_id" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  let querySource: "user" | "admin-fallback" = "user";
  let { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("org_id", appUser.org_id)
    .neq("status", "closed");

  if (error && error.message.toLowerCase().includes("permission denied")) {
    const adminState = createOptionalAdminClient();
    if (!adminState.client) {
      console.error("[conversations/count] admin fallback unavailable:", {
        reason: adminState.reason,
        orgId: appUser.org_id,
      });
    } else {
      querySource = "admin-fallback";
      const fallback = await adminState.client
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", appUser.org_id)
        .neq("status", "closed");
      count = fallback.count;
      error = fallback.error;
    }
  }

  if (error) {
    console.error("[conversations/count] query failed:", {
      orgId: appUser.org_id,
      querySource,
      code: error.code ?? null,
      message: error.message,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
    return NextResponse.json({ error: "Unable to fetch conversation count." }, { status: 500 });
  }

  return NextResponse.json({ open: count ?? 0 });
}
