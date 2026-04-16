/**
 * POST /api/conversations/:conversationId/reply
 *
 * Sends an outbound agent reply. Flow:
 *   1. Authenticate + get app user / org
 *   2. Validate body
 *   3. Insert outbound message into `messages`
 *   4. Insert into `sent_replies` (linked to ai_draft if one was used)
 *   5. Update conversation last_message_at
 *   6. Emit usage event
 *   7. Trigger edit analysis via next/server after() — guaranteed to complete
 *      even after the response is sent (Vercel-safe, no silent drops)
 *   8. Return message + sent_reply IDs
 */

import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEditAnalysis } from "@/lib/ai/analysis";
import { sendConversationReplyWithGmail } from "@/lib/email-connector/gmail-sender";

type ReplyPayload = {
  body: string;
  aiDraftId?: string | null; // present when agent used or modified a draft
};

function validateBody(raw: unknown): ReplyPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.body !== "string" || !obj.body.trim()) return null;
  return {
    body: obj.body.trim(),
    aiDraftId: typeof obj.aiDraftId === "string" ? obj.aiDraftId : null,
  };
}

// ── Edit analysis (fire-and-forget) ──────────────────────────────────────────

async function triggerEditAnalysis(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  conversationId: string,
  aiDraftId: string,
  sentReplyId: string,
  finalText: string
) {
  try {
    // Fetch the original AI draft text
    const { data: draft, error } = await supabase
      .from("ai_drafts")
      .select("id, draft_text")
      .eq("id", aiDraftId)
      .single();

    if (error || !draft) {
      console.warn("[reply] ai_draft not found for analysis:", aiDraftId);
      return;
    }

    const analysis = await runEditAnalysis(
      (draft as { id: string; draft_text: string }).draft_text,
      finalText
    );

    await supabase.from("edit_analyses").insert({
      org_id: orgId,
      conversation_id: conversationId,
      ai_draft_id: aiDraftId,
      sent_reply_id: sentReplyId,
      edit_distance_score: analysis.editDistanceScore,
      change_percent: analysis.changePercent,
      categories: analysis.categories,
      likely_reason_summary: analysis.likelyReasonSummary,
      classification_confidence: analysis.classificationConfidence,
      raw_diff_json: analysis.rawDiffJson,
      raw_analysis_json: {
        categories: analysis.categories,
        likelyReasonSummary: analysis.likelyReasonSummary,
        classificationConfidence: analysis.classificationConfidence,
        shouldEscalate: analysis.shouldEscalate,
      },
    });

    // Act on escalation flag — bump conversation risk to red
    if (analysis.shouldEscalate) {
      await supabase
        .from("conversations")
        .update({ risk_level: "red", ai_confidence: "red" })
        .eq("id", conversationId)
        .eq("org_id", orgId);
      console.log(`[reply] Escalation flag set — conversation ${conversationId} risk → red`);
    }
  } catch (err) {
    console.error(
      "[reply] edit analysis failed:",
      err instanceof Error ? err.message : err
    );
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

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
    .select("id, org_id, full_name, email")
    .eq("auth_user_id", user.id)
    .single();

  if (userErr || !appUser) {
    return NextResponse.json({ error: "App user not found" }, { status: 403 });
  }

  const { id: userId, org_id: orgId, full_name: fullName } =
    appUser as { id: string; org_id: string; full_name: string; email: string };

  // Validate body
  let payload: ReplyPayload | null;
  try {
    payload = validateBody(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!payload) {
    return NextResponse.json({ error: "body is required" }, { status: 422 });
  }

  const { body, aiDraftId } = payload;

  const admin = createAdminClient();
  let outbound;
  try {
    outbound = await sendConversationReplyWithGmail({
      db: admin,
      orgId,
      conversationId,
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail send failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!outbound) {
    return NextResponse.json({
      error: "Connect Gmail before sending customer replies.",
      hint: "Use onboarding or settings to connect a Gmail mailbox. Internal notes are still available.",
    }, { status: 400 });
  }

  // 1. Insert outbound message after the provider accepted the send.
  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversationId,
      sender_type: "agent",
      sender_user_id: userId,
      author_name: fullName ?? "Agent",
      direction: "outbound",
      channel_message_id: `${outbound.provider}:${outbound.providerMessageId}`,
      body_text: body,
      metadata_json: {
        ...(aiDraftId ? { source_ai_draft_id: aiDraftId } : {}),
        provider: outbound.provider,
        provider_message_id: outbound.providerMessageId,
        provider_thread_id: outbound.providerThreadId,
        rfc_message_id: outbound.rfcMessageId,
        sent_from: outbound.sentFrom,
      },
    })
    .select("id")
    .single();

  if (msgErr || !message) {
    console.error("[reply] message insert failed:", msgErr?.message);
    return NextResponse.json(
      { error: "Failed to persist message" },
      { status: 500 }
    );
  }

  const messageId = (message as { id: string }).id;

  // 2. Insert sent_reply
  const { data: sentReply, error: replyErr } = await supabase
    .from("sent_replies")
    .insert({
      org_id: orgId,
      conversation_id: conversationId,
      source_ai_draft_id: aiDraftId ?? null,
      sent_by_user_id: userId,
      message_id: messageId,
      body_text: body,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (replyErr || !sentReply) {
    console.error("[reply] sent_reply insert failed:", replyErr?.message);
    // Non-fatal — message is already persisted
  }

  const sentReplyId = sentReply ? (sentReply as { id: string }).id : null;

  // 3. Update conversation last_message_at
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("org_id", orgId);

  // 4. Emit usage event
  supabase
    .from("usage_events")
    .insert({
      org_id: orgId,
      user_id: userId,
      event_type: "email_sent",
      units: 1,
      metadata_json: {
        conversation_id: conversationId,
        has_ai_draft: Boolean(aiDraftId),
      },
    })
    .then(({ error: e }) => {
      if (e) console.warn("[reply] usage event failed:", e.message);
    });

  // 5. Trigger edit analysis if a draft was linked.
  // after() tells Next.js / Vercel to keep the function alive until this
  // promise settles — the analysis and its DB write are guaranteed to complete
  // even though the HTTP response has already been returned to the client.
  if (aiDraftId && sentReplyId) {
    after(
      triggerEditAnalysis(
        supabase,
        orgId,
        conversationId,
        aiDraftId,
        sentReplyId,
        body
      ).catch((e: unknown) =>
        console.warn("[reply] analysis trigger error:", e instanceof Error ? e.message : e)
      )
    );
  }

  return NextResponse.json({
    ok: true,
    conversationId,
    messageId,
    sentReplyId,
    analysisQueued: Boolean(aiDraftId && sentReplyId),
  });
}
