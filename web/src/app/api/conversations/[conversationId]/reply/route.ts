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

import { randomUUID } from "crypto";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { createClient } from "@/lib/supabase/server";
import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { runEditAnalysis } from "@/lib/ai/analysis";
import { sendConversationReplyWithGmail } from "@/lib/email-connector/gmail-sender";

type ReplyPayload = {
  body: string;
  aiDraftId?: string | null; // present when agent used or modified a draft
};

type OutboundResult = {
  provider: "gmail" | "workhat_test";
  providerMessageId: string;
  providerThreadId: string;
  rfcMessageId: string;
  sentFrom: string;
  simulated?: boolean;
};

type AdminDb = NonNullable<ReturnType<typeof createOptionalAdminClient>["client"]>;

function validateBody(raw: unknown): ReplyPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.body !== "string" || !obj.body.trim()) return null;
  return {
    body: obj.body.trim(),
    aiDraftId:
      typeof obj.aiDraftId === "string" && obj.aiDraftId.trim()
        ? obj.aiDraftId.trim()
        : null,
  };
}

async function buildManualTestOutbound(
  db: AdminDb,
  orgId: string,
  conversationId: string
): Promise<OutboundResult | null> {
  const { data: inbound } = await db
    .from("messages")
    .select("metadata_json")
    .eq("org_id", orgId)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const metadata = (inbound as { metadata_json?: Record<string, unknown> } | null)?.metadata_json ?? {};
  if (metadata.created_manually !== true) return null;

  const { data: channel } = await db
    .from("channels")
    .select("inbound_address, config_json")
    .eq("org_id", orgId)
    .eq("type", "email")
    .maybeSingle();

  const channelData = channel as { inbound_address?: string | null; config_json?: Record<string, string> } | null;
  const fromAddress =
    channelData?.config_json?.support_email ||
    channelData?.inbound_address ||
    "local-test@work-hat.com";

  return {
    provider: "workhat_test",
    providerMessageId: `local-${randomUUID()}`,
    providerThreadId: `local-thread-${conversationId}`,
    rfcMessageId: `<workhat-local-${randomUUID()}@work-hat.com>`,
    sentFrom: fromAddress,
    simulated: true,
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
  const { conversationId } = await params;
  if (!conversationId?.trim()) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }

  const appUser = await getCurrentAppUser<{
    id: string;
    org_id: string;
    role: string;
    full_name?: string;
    email?: string;
  }>({ label: "reply", select: "id, org_id, role, full_name, email" });
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { id: userId, org_id: orgId, full_name: fullName } = appUser;

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

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (conversationError) {
    console.error("[reply] conversation lookup failed:", conversationError.message);
    return NextResponse.json({ error: "Unable to verify this conversation." }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found for this workspace." }, { status: 404 });
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
      console.error("[reply] ai draft lookup failed:", aiDraftError.message);
      return NextResponse.json({ error: "Unable to verify the AI draft." }, { status: 500 });
    }

    if (!aiDraft) {
      return NextResponse.json(
        { error: "AI draft not found for this conversation." },
        { status: 400 }
      );
    }
  }

  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.error("[reply] admin client unavailable:", adminState.reason);
    return NextResponse.json(
      { error: "Reply sending is temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
  const admin = adminState.client;

  let outbound: OutboundResult | null;
  try {
    outbound = await sendConversationReplyWithGmail({
      db: admin,
      orgId,
      conversationId,
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail send failed.";
    console.error("[reply] Gmail send failed:", message);
    return NextResponse.json({ error: "Unable to send this reply through Gmail. Please try again." }, { status: 502 });
  }

  if (!outbound) {
    outbound = await buildManualTestOutbound(admin, orgId, conversationId);
  }

  if (!outbound) {
    return NextResponse.json({
      error: "Connect Gmail before sending customer replies.",
      hint: "Use onboarding or settings to connect a Gmail mailbox. Internal notes are still available. Manually created test conversations can still be logged locally.",
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
        simulated_send: Boolean(outbound.simulated),
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
  const { error: conversationUpdateError } = await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("org_id", orgId);

  if (conversationUpdateError) {
    console.warn("[reply] conversation timestamp update failed:", conversationUpdateError.message);
  }

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
          simulated_send: Boolean(outbound.simulated),
        },
      });

    if (usageError) console.warn("[reply] usage event failed:", usageError.message);
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
    simulatedSend: Boolean(outbound.simulated),
    warning: outbound.simulated ? "No Gmail mailbox is connected, so this test reply was logged locally and not emailed to the customer." : undefined,
  });
}
