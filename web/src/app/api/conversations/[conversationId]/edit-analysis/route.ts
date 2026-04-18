/**
 * GET /api/conversations/:conversationId/edit-analysis
 *
 * Returns all edit analysis records for a conversation, ordered newest first.
 * Used by the thread workspace to display AI improvement insights per reply.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  if (!conversationId?.trim()) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const appUser = await getCurrentAppUser({ label: "edit-analysis" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = appUser.org_id;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (conversationError) {
    console.error("[edit-analysis] conversation lookup failed:", conversationError.message);
    return NextResponse.json({ error: "Unable to verify this conversation." }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found for this workspace." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("edit_analyses")
    .select("id, ai_draft_id, sent_reply_id, edit_distance_score, change_percent, categories, likely_reason_summary, classification_confidence, raw_diff_json, raw_analysis_json, created_at")
    .eq("org_id", orgId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[edit-analysis] query failed:", error.message);
    return NextResponse.json({ error: "Unable to load edit analysis." }, { status: 500 });
  }

  return NextResponse.json({ analyses: data ?? [] });
}
