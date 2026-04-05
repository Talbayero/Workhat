// POST /api/conversations/:conversationId/edit-analysis
// Phase 1: stub that accepts and logs the edit classification payload.
// Phase 2: insert into edit_analyses table, update ai_drafts.was_accepted flag.

import { NextRequest, NextResponse } from "next/server";

type EditAnalysisPayload = {
  aiDraftText: string;
  finalText: string;
  editType: string;
  editIntensity: number; // 0–100
  agentId: string;
  messageId?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  let payload: EditAnalysisPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.editType || payload.editIntensity == null) {
    return NextResponse.json({ error: "editType and editIntensity are required" }, { status: 422 });
  }

  // Phase 2: insert into Supabase
  // const supabase = createServerSupabaseClient();
  // await supabase.from("edit_analyses").insert({
  //   conversation_id: conversationId,
  //   ai_draft_text: payload.aiDraftText,
  //   final_text: payload.finalText,
  //   edit_type: payload.editType,
  //   edit_intensity: payload.editIntensity,
  //   agent_id: payload.agentId,
  //   message_id: payload.messageId,
  // });

  console.info(
    `[edit-analysis] conv=${conversationId} type=${payload.editType} intensity=${payload.editIntensity}%`
  );

  return NextResponse.json({ ok: true, conversationId });
}
