/**
 * POST /api/conversations/:conversationId/note
 *
 * Inserts an internal note — visible to the team only, never sent to the customer.
 * Creates a message row with direction = 'internal', no sent_reply record.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { createClient } from "@/lib/supabase/server";

type NotePayload = {
  body: string;
};

function validateBody(raw: unknown): NotePayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.body !== "string" || !obj.body.trim()) return null;
  return { body: obj.body.trim() };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  if (!conversationId?.trim()) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }

  const appUser = await getCurrentAppUser<{
    id: string;
    org_id: string;
    role: string;
    full_name?: string;
  }>({ label: "conversation-note", select: "id, org_id, role, full_name" });
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { id: userId, org_id: orgId, full_name: fullName } = appUser;

  // Validate body
  let payload: NotePayload | null;
  try {
    payload = validateBody(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!payload) {
    return NextResponse.json({ error: "body is required" }, { status: 422 });
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (conversationError) {
    console.error("[note] conversation lookup failed:", conversationError.message);
    return NextResponse.json({ error: "Unable to verify this conversation." }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found for this workspace." }, { status: 404 });
  }

  // Insert internal message
  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversationId,
      sender_type: "agent",
      sender_user_id: userId,
      author_name: fullName ?? "Agent",
      direction: "internal",
      body_text: payload.body,
      metadata_json: {},
    })
    .select("id")
    .single();

  if (msgErr || !message) {
    console.error("[note] message insert failed:", msgErr?.message);
    return NextResponse.json({ error: "Failed to persist note" }, { status: 500 });
  }

  const now = new Date().toISOString();
  return NextResponse.json({
    ok: true,
    conversationId,
    messageId: (message as { id: string }).id,
    // Full message shape for optimistic UI updates in the thread workspace
    message: {
      id: (message as { id: string }).id,
      sender: fullName ?? "Agent",
      senderType: "internal",
      timestamp: now,
      body: payload.body,
    },
  });
}
