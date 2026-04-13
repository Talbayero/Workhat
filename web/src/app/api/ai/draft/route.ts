/**
 * POST /api/ai/draft
 *
 * Request body:
 *   { conversationId: string, sourceMessageId?: string }
 *
 * Flow:
 *   1. Authenticate — get session + app user
 *   2. Fetch conversation, messages, contact, company
 *   3. Retrieve relevant knowledge chunks (full-text search)
 *   4. Assemble ConversationContext
 *   5. Generate draft via AI layer
 *   6. Persist to ai_drafts table
 *   7. Return structured result
 *
 * AI generation and persistence are kept as separate concerns.
 * If persistence fails, the draft is still returned (non-fatal).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateDraft, PROMPT_VERSION } from "@/lib/ai";
import type { ConversationContext, MessageContext, KnowledgeSnippet } from "@/lib/ai/types";

// ── Request validation ────────────────────────────────────────────────────────

type DraftRequestBody = {
  conversationId: string;
  sourceMessageId?: string;
};

function validateBody(raw: unknown): DraftRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.conversationId !== "string" || !obj.conversationId.trim()) return null;
  return {
    conversationId: obj.conversationId.trim(),
    sourceMessageId:
      typeof obj.sourceMessageId === "string" ? obj.sourceMessageId : undefined,
  };
}

// ── Knowledge retrieval ───────────────────────────────────────────────────────

/**
 * Retrieve the top-k knowledge chunks relevant to a conversation.
 * V1: keyword search using plainto_tsquery against content_tsv.
 * Phase 2: replace or augment with vector similarity search.
 */
async function fetchKnowledgeSnippets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subject: string,
  lastMessageBody: string,
  limit = 4
): Promise<KnowledgeSnippet[]> {
  const searchTerms = `${subject} ${lastMessageBody}`.slice(0, 500);

  try {
    const { data, error } = await supabase
      .from("knowledge_chunks")
      .select(`
        id,
        content,
        knowledge_entries (
          id,
          title,
          entry_type,
          is_active
        )
      `)
      .textSearch("content_tsv", searchTerms, {
        type: "plain",
        config: "english",
      })
      .eq("knowledge_entries.is_active", true)
      .limit(limit);

    if (error || !data) return [];

    // Supabase returns the joined relation as an array; we cast to access it.
    type RawChunk = {
      id: string;
      content: string;
      knowledge_entries:
        | { id: string; title: string; entry_type: string; is_active: boolean }[]
        | { id: string; title: string; entry_type: string; is_active: boolean }
        | null;
    };

    return (data as unknown as RawChunk[])
      .map((row) => {
        const entry = Array.isArray(row.knowledge_entries)
          ? row.knowledge_entries[0]
          : row.knowledge_entries;
        if (!entry) return null;
        return {
          id: row.id,
          title: entry.title ?? "Knowledge entry",
          excerpt: row.content.slice(0, 400),
          entryType: entry.entry_type ?? "rule",
        };
      })
      .filter((s): s is KnowledgeSnippet => s !== null);
  } catch {
    // Knowledge retrieval is non-fatal — log and continue
    console.warn("[ai/draft] knowledge retrieval failed — continuing without snippets");
    return [];
  }
}

// ── Context assembly ──────────────────────────────────────────────────────────

type DbMessage = {
  id: string;
  sender_type: string;
  author_name: string;
  body_text: string;
  created_at: string;
};

type DbConversationFull = {
  id: string;
  subject: string;
  status: string;
  risk_level: string;
  contacts: {
    full_name: string;
    email: string | null;
    tier: string;
    notes: string | null;
  } | null;
  companies: {
    name: string;
    industry: string;
  } | null;
};

function senderTypeToRole(senderType: string): MessageContext["role"] {
  if (senderType === "customer") return "customer";
  if (senderType === "agent") return "agent";
  if (senderType === "ai") return "ai";
  return "internal";
}

async function assembleContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string
): Promise<ConversationContext> {
  // Fetch conversation + contact + company in one call
  const { data: convData, error: convErr } = await supabase
    .from("conversations")
    .select(`
      id, subject, status, risk_level,
      contacts ( full_name, email, tier, notes ),
      companies ( name, industry )
    `)
    .eq("id", conversationId)
    .single();

  if (convErr || !convData) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  const conv = convData as unknown as DbConversationFull;

  // Fetch messages (last 20 to keep context window manageable)
  const { data: msgData, error: msgErr } = await supabase
    .from("messages")
    .select("id, sender_type, author_name, body_text, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (msgErr) {
    console.warn("[ai/draft] failed to fetch messages:", msgErr.message);
  }

  const messages: MessageContext[] = ((msgData ?? []) as DbMessage[]).map((m) => ({
    role: senderTypeToRole(m.sender_type),
    author: m.author_name ?? m.sender_type,
    body: m.body_text,
    sentAt: new Date(m.created_at).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  const lastInbound = [...messages].reverse().find((m) => m.role === "customer");
  const lastBody = lastInbound?.body ?? conv.subject ?? "";

  // Fetch knowledge snippets
  const knowledgeSnippets = await fetchKnowledgeSnippets(
    supabase,
    conv.subject ?? "",
    lastBody
  );

  return {
    conversationId,
    subject: conv.subject ?? "(no subject)",
    status: conv.status ?? "open",
    riskLevel: conv.risk_level ?? "green",
    contact: {
      fullName: conv.contacts?.full_name ?? "Customer",
      email: conv.contacts?.email ?? "",
      tier: conv.contacts?.tier ?? "",
      notes: conv.contacts?.notes ?? "",
    },
    company: conv.companies
      ? { name: conv.companies.name, industry: conv.companies.industry }
      : null,
    messages,
    knowledgeSnippets,
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────

async function persistDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  sourceMessageId: string | undefined,
  userId: string,
  orgId: string,
  result: Awaited<ReturnType<typeof generateDraft>>
): Promise<string | null> {
  const { data, error } = await supabase
    .from("ai_drafts")
    .insert({
      org_id: orgId,
      conversation_id: conversationId,
      source_message_id: sourceMessageId ?? null,
      generated_by_user_id: userId,
      draft_text: result.draftText,
      rationale: result.rationale,
      confidence_level: result.confidenceLevel,
      risk_flags: result.riskFlags,
      missing_context: result.missingContext,
      recommended_tags: result.recommendedTags,
      provider: result.provider,
      model: result.model,
      prompt_version: result.promptVersion,
      request_tokens: result.requestTokens,
      response_tokens: result.responseTokens,
      latency_ms: result.latencyMs,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ai/draft] persist failed:", error.message);
    return null;
  }

  return (data as { id: string }).id;
}

// ── Usage event ───────────────────────────────────────────────────────────────

async function emitUsageEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  conversationId: string,
  latencyMs: number
) {
  await supabase.from("usage_events").insert({
    org_id: orgId,
    user_id: userId,
    event_type: "ai_draft_generated",
    units: 1,
    metadata_json: { conversation_id: conversationId, latency_ms: latencyMs },
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Authenticate
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get app user + org
  const { data: appUser, error: userErr } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (userErr || !appUser) {
    return NextResponse.json(
      { error: "App user not found — ensure onboarding is complete" },
      { status: 403 }
    );
  }

  // Validate request
  let body: DraftRequestBody | null;
  try {
    body = validateBody(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 422 }
    );
  }

  const { conversationId, sourceMessageId } = body;

  // Assemble context
  let context: ConversationContext;
  try {
    context = await assembleContext(supabase, conversationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load conversation";
    return NextResponse.json({ error: message }, { status: 404 });
  }

  // Generate draft
  let result: Awaited<ReturnType<typeof generateDraft>>;
  try {
    result = await generateDraft({
      context,
      promptVersion: PROMPT_VERSION,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    console.error("[ai/draft] generation error:", message);
    return NextResponse.json(
      { error: "AI draft generation failed", detail: message },
      { status: 502 }
    );
  }

  // Persist draft (non-fatal if it fails — still return the draft)
  const draftId = await persistDraft(
    supabase,
    conversationId,
    sourceMessageId,
    appUser.id as string,
    appUser.org_id as string,
    result
  );

  // Emit usage event (fire and forget)
  emitUsageEvent(
    supabase,
    appUser.org_id as string,
    appUser.id as string,
    conversationId,
    result.latencyMs
  ).catch((e: unknown) =>
    console.warn("[ai/draft] usage event failed:", e instanceof Error ? e.message : e)
  );

  return NextResponse.json({
    draft: {
      id: draftId,
      draftText: result.draftText,
      rationale: result.rationale,
      confidenceLevel: result.confidenceLevel,
      riskFlags: result.riskFlags,
      missingContext: result.missingContext,
      recommendedTags: result.recommendedTags,
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      latencyMs: result.latencyMs,
    },
  });
}
