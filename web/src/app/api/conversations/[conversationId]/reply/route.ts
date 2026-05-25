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
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { runEditAnalysis } from "@/ai/workflows/edit-analysis";
import { sendConversationReply } from "@/lib/email/outbound";
import { isGmailOutboundError } from "@/lib/email/gmail-sender";
import { extractContextFromRequest } from "@/lib/request-context";
import { refreshConversationSla } from "@/lib/sla/refresh";
import { emitWorkflowEvent } from "@/lib/workflow-engine";

type ReplyPayload = {
  body: string;
  aiDraftId?: string | null; // present when agent used or modified a draft
};

type OutboundResult = {
  connectionId: string;
  provider: string;
  providerMessageId: string;
  providerThreadId: string;
  rfcMessageId: string;
  sentFrom: string;
};

const MAX_REPLY_LENGTH = 50_000;

function validateBody(raw: unknown): ReplyPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.body !== "string" || !obj.body.trim()) return null;
  if (obj.body.trim().length > MAX_REPLY_LENGTH) return null;
  return {
    body: obj.body.trim(),
    aiDraftId:
      typeof obj.aiDraftId === "string" && obj.aiDraftId.trim()
        ? obj.aiDraftId.trim()
        : null,
  };
}

function mapSendFailure(error: unknown) {
  if (isGmailOutboundError(error)) {
    if (error.code === "gmail_token_refresh_failed") {
      return {
        status: 401,
        code: error.code,
        error: "Gmail connection needs to be reconnected before sending.",
        hint: "Reconnect Gmail in Settings -> Channels, then try sending again.",
      };
    }

    if (error.code === "gmail_api_rejected") {
      return {
        status: 502,
        code: error.code,
        error: "Gmail rejected the send.",
        hint: "Check that the connected Gmail mailbox is active and has permission to send mail, then try again.",
      };
    }

    if (error.code === "gmail_missing_recipient") {
      return {
        status: 422,
        code: error.code,
        error: "This conversation does not have a customer email address to reply to.",
      };
    }

    if (error.code === "conversation_not_found") {
      return {
        status: 404,
        code: error.code,
        error: "Conversation not found for this workspace.",
      };
    }
  }

  return {
    status: 502,
    code: "gmail_send_failed",
    error: "Unable to send this reply through Gmail.",
    hint: "Try again. If the issue persists, reconnect Gmail in Settings -> Channels.",
  };
}

function sendFailureJson(error: unknown, requestId: string) {
  const { status, ...body } = mapSendFailure(error);
  return NextResponse.json({ ...body, requestId }, { status });
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
      .select("id, draft_text, context_object_id, context_object_version_id")
      .eq("id", aiDraftId)
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (error || !draft) {
      console.warn("[reply] ai_draft not found for analysis:", aiDraftId);
      return;
    }

    const analysis = await runEditAnalysis(
      (draft as { id: string; draft_text: string }).draft_text,
      finalText
    );

    const { error: analysisInsertError } = await supabase.from("edit_analyses").insert({
      org_id: orgId,
      conversation_id: conversationId,
      ai_draft_id: aiDraftId,
      sent_reply_id: sentReplyId,
      context_object_id: (draft as { context_object_id?: string | null }).context_object_id ?? null,
      context_object_version_id: (draft as { context_object_version_id?: string | null }).context_object_version_id ?? null,
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

    if (analysisInsertError) {
      console.warn("[reply] edit analysis insert failed:", analysisInsertError.message);
      return;
    }

    // Act on escalation flag — bump conversation risk to red
    if (analysis.shouldEscalate) {
      const { error: escalationError } = await supabase
        .from("conversations")
        .update({ risk_level: "red", ai_confidence: "red" })
        .eq("id", conversationId)
        .eq("org_id", orgId);

      if (escalationError) {
        console.warn("[reply] escalation update failed:", escalationError.message);
      }
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
  const requestId = extractContextFromRequest(req).requestId ?? "req_unknown";
  const { conversationId } = await params;
  if (!conversationId?.trim()) {
    return NextResponse.json({ error: "conversationId is required.", requestId }, { status: 400 });
  }

  const appUser = await getCurrentAppUser<{
    id: string;
    org_id: string;
    role: string;
    full_name?: string;
    email?: string;
  }>({ label: "reply", select: "id, org_id, role, full_name, email" });
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized", requestId }, { status: 401 });
  }
  const denied = await requireCapability(appUser, "conversations.reply", "reply");
  if (denied) return denied;

  const supabase = await createClient();
  const { id: userId, org_id: orgId, full_name: fullName } = appUser;

  // Validate body
  let payload: ReplyPayload | null;
  try {
    payload = validateBody(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", requestId }, { status: 400 });
  }
  if (!payload) {
    return NextResponse.json({
      error: "Write a reply before sending.",
      code: "empty_reply",
      requestId,
    }, { status: 422 });
  }

  const { body, aiDraftId } = payload;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (conversationError) {
    console.error("[reply] conversation lookup failed:", {
      requestId,
      orgId,
      conversationId,
      message: conversationError.message,
    });
    return NextResponse.json({ error: "Unable to verify this conversation.", requestId }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found for this workspace.", requestId }, { status: 404 });
  }

  if ((conversation as { status?: string | null }).status === "closed") {
    return NextResponse.json({
      error: "Conversation is closed. Reopen it before sending a reply.",
      code: "conversation_closed",
      requestId,
    }, { status: 409 });
  }

  if (aiDraftId) {
    const { data: aiDraft, error: aiDraftError } = await supabase
      .from("ai_drafts")
      .select("id")
      .eq("id", aiDraftId)
      .eq("conversation_id", conversationId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (aiDraftError) {
      console.error("[reply] ai draft lookup failed:", {
        requestId,
        orgId,
        conversationId,
        aiDraftId,
        message: aiDraftError.message,
      });
      return NextResponse.json({ error: "Unable to verify the AI draft.", requestId }, { status: 500 });
    }

    if (!aiDraft) {
      return NextResponse.json(
        { error: "AI draft not found for this conversation.", requestId },
        { status: 400 }
      );
    }
  }

  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.error("[reply] admin client unavailable:", { requestId, reason: adminState.reason });
    return NextResponse.json(
      { error: "Reply sending is temporarily unavailable. Please try again.", requestId },
      { status: 503 }
    );
  }
  const admin = adminState.client;

  let outbound: OutboundResult | null;
  try {
    console.info("[reply] Gmail send attempt:", {
      requestId,
      orgId,
      conversationId,
      userId,
    });
    outbound = await sendConversationReply({
      db: admin,
      orgId,
      conversationId,
      body,
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox send failed.";
    const response = mapSendFailure(error);
    console.error("[reply] Gmail send failed:", {
      requestId,
      orgId,
      conversationId,
      userId,
      code: response.code,
      message,
    });
    return sendFailureJson(error, requestId);
  }

  if (!outbound) {
    return NextResponse.json({
      error: "Connect Gmail OAuth before sending customer replies.",
      code: "gmail_connection_missing",
      hint: "Use onboarding or Settings -> Channels to activate Gmail OAuth. The MVP does not support simulated sends or non-Gmail mailbox sending.",
      requestId,
    }, { status: 400 });
  }

  console.info("[reply] Gmail send accepted:", {
    requestId,
    orgId,
    conversationId,
    emailConnectionId: outbound.connectionId,
    gmailMessageId: outbound.providerMessageId,
    gmailThreadId: outbound.providerThreadId,
  });

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
    console.error("[reply] message insert failed:", {
      requestId,
      orgId,
      conversationId,
      emailConnectionId: outbound.connectionId,
      gmailMessageId: outbound.providerMessageId,
      message: msgErr?.message,
    });
    return NextResponse.json(
      { error: "Gmail sent the reply, but Work Hat could not save the outbound message. Contact support with this request ID.", requestId },
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
    console.error("[reply] sent_reply insert failed:", {
      requestId,
      orgId,
      conversationId,
      messageId,
      emailConnectionId: outbound.connectionId,
      gmailMessageId: outbound.providerMessageId,
      message: replyErr?.message,
    });
    return NextResponse.json(
      { error: "Gmail sent the reply, but Work Hat could not record the sent reply. Contact support with this request ID.", requestId },
      { status: 500 }
    );
  }

  const sentReplyId = sentReply ? (sentReply as { id: string }).id : null;

  // 3. Update conversation last_message_at
  const { error: conversationUpdateError } = await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("org_id", orgId);

  if (conversationUpdateError) {
    console.warn("[reply] conversation timestamp update failed:", {
      requestId,
      orgId,
      conversationId,
      message: conversationUpdateError.message,
    });
  }

  console.info("[reply] reply persisted:", {
    requestId,
    orgId,
    conversationId,
    emailConnectionId: outbound.connectionId,
    gmailMessageId: outbound.providerMessageId,
    gmailThreadId: outbound.providerThreadId,
    messageId,
    sentReplyId,
  });

  // 4. Emit usage event
  after(async () => {
    const { error: usageError } = await supabase
      .from("usage_events")
      .insert({
        org_id: orgId,
        user_id: userId,
        event_type: "email_sent",
        units: 1,
        metadata_json: {
          conversation_id: conversationId,
          has_ai_draft: Boolean(aiDraftId),
          provider: outbound.provider,
        },
      });

    if (usageError) {
      console.warn("[reply] usage event failed:", {
        requestId,
        orgId,
        conversationId,
        message: usageError.message,
      });
    }
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

  after(async () => {
    await refreshConversationSla({
      db: admin,
      orgId,
      conversationId,
      source: "api.conversations.reply",
    });

    await emitWorkflowEvent({
      orgId,
      eventType: "reply.sent",
      aggregateType: "sent_reply",
      aggregateId: sentReplyId ?? messageId,
      conversationId,
      actorId: userId,
      source: "api.conversations.reply",
      payload: {
        messageId,
        sentReplyId,
        aiDraftId: aiDraftId ?? null,
        provider: outbound.provider,
        emailConnectionId: outbound.connectionId,
        gmailMessageId: outbound.providerMessageId,
        gmailThreadId: outbound.providerThreadId,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    requestId,
    conversationId,
    messageId,
    sentReplyId,
    analysisQueued: Boolean(aiDraftId && sentReplyId),
  });
}

