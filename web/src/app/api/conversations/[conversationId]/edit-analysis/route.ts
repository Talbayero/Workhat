/**
 * GET /api/conversations/:conversationId/edit-analysis
 *
 * Returns all edit analysis records for a conversation, ordered newest first.
 * Used by the thread workspace to display AI improvement insights per reply.
 *
 * Previously a Phase 1 stub (POST, no auth, in-memory only).
 * Now a real authenticated read endpoint backed by the edit_analyses table.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const supabase = await createClient();

  // Authenticate
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get app user + org (ensures results are scoped to the caller's org)
  const { data: appUser, error: userErr } = await supabase
    .from("users")
    .select("id, org_id")
    .eq("auth_user_id", user.id)
    .single();

  if (userErr || !appUser) {
    return NextResponse.json({ error: "App user not found" }, { status: 403 });
  }

  const { org_id: orgId } = appUser as { id: string; org_id: string };

  // Fetch analyses scoped to this org + conversation
  const { data, error } = await supabase
    .from("edit_analyses")
    .select(`
      id,
      ai_draft_id,
      sent_reply_id,
      edit_distance_score,
      change_percent,
      categories,
      likely_reason_summary,
      classification_confidence,
      raw_diff_json,
      raw_analysis_json,
      created_at
    `)
    .eq("org_id", orgId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[edit-analysis] query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ analyses: data ?? [] });
}
