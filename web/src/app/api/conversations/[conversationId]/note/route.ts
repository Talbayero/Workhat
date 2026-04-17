/**
 * POST /api/conversations/:conversationId/note
 *
 * Inserts an internal note — visible to the team only, never sent to the customer.
 * Creates a message row with direction = 'internal', no sent_reply record.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type NotePayload = {
  body: string;
};

function validateBody(raw: unknown): NotePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.body !== "string" || !obj.body.trim()) return null;
  return { body: obj.body.trim() };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const supabase = await createClient();

  // Authenticate
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get app user + org
  const { data: appUser, error: userErr } = await supabase
    .from("users")
    .select("id, org_id, full_name")
    .eq("auth_user_id", user.id)
    .single();

  if (userErr || !appUser) {
    return NextResponse.json({ error: "App user not found" }, { status: 403 });
  }

  const { id: userId, org_id: orgId, full_name: fullName } =
    appUser as { id: string; org_id: string; full_name: string };

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
    return NextResponse.json({ error: conversationError.message }, { status: 500 });
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

  return NextResponse.json({
    ok: true,
    conversationId,
    messageId: (message as { id: string }).id,
  });
}
