import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/conversations/:id/edit-analysis — fetch edit analyses for a conversation */

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("edit_analyses")
    .select(
      "id, edit_distance_score, change_percent, categories, likely_reason_summary, classification_confidence, created_at"
    )
    .eq("conversation_id", conversationId)
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ analyses: data ?? [] });
}
