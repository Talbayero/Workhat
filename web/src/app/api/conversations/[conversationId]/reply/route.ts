// POST /api/conversations/:conversationId/reply
// Phase 1: stub that validates the payload and returns 200.
// Phase 2: insert into messages + sent_replies tables, trigger edit analysis.

import { NextRequest, NextResponse } from "next/server";

type ReplyPayload = {
  body: string;
  agentId: string;
  aiDraftText?: string; // present when agent used or modified a draft
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  let payload: ReplyPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.body?.trim()) {
    return NextResponse.json({ error: "Reply body is required" }, { status: 422 });
  }

  // Phase 2: insert into Supabase
  // const supabase = createServerSupabaseClient();
  // await supabase.from("messages").insert({ ... });
  // await supabase.from("sent_replies").insert({ ... });
  // if (payload.aiDraftText) { trigger edit analysis }

  console.info(`[reply] conv=${conversationId} agent=${payload.agentId} len=${payload.body.length}`);

  return NextResponse.json({
    ok: true,
    conversationId,
    messageId: `msg-${Date.now()}`,
  });
}
