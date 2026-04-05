// POST /api/conversations/:conversationId/note
// Phase 1: stub that validates and returns 200.
// Phase 2: insert into messages table with senderType='internal', no sent_reply record.

import { NextRequest, NextResponse } from "next/server";

type NotePayload = {
  body: string;
  agentId: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  let payload: NotePayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.body?.trim()) {
    return NextResponse.json({ error: "Note body is required" }, { status: 422 });
  }

  // Phase 2: insert into Supabase
  // const supabase = createServerSupabaseClient();
  // await supabase.from("messages").insert({ senderType: "internal", ... });

  console.info(`[note] conv=${conversationId} agent=${payload.agentId} len=${payload.body.length}`);

  return NextResponse.json({
    ok: true,
    conversationId,
    messageId: `msg-${Date.now()}`,
  });
}
