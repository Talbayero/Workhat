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
import { after } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import { generateDraft, PROMPT_VERSION } from "@/ai";
import { generateEmbedding } from "@/lib/embeddings";
import type { ConversationContext, MessageContext, KnowledgeSnippet } from "@/ai/types";
import { assignPromptVersion, linkPromptAssignmentToDraft } from "@/ai/prompts/experiments";
import { emitWorkflowEvent } from "@/lib/workflow-engine";
import { resolveDraftContextSelection } from "@/lib/context/context-objects";
import { AISettingsError, mapAISettingsError, resolveOrgAIConfig, type ResolvedAIConfig } from "@/lib/ai-settings";
import { extractContextFromRequest } from "@/lib/request-context";

// ── Request validation ────────────────────────────────────────────────────────

type DraftRequestBody = {
  conversationId: string;
  sourceMessageId?: string;
  contextObjectId?: string;
};

function validateBody(raw: unknown): DraftRequestBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.conversationId !== "string" || !obj.conversationId.trim()) return null;
  return {
    conversationId: obj.conversationId.trim(),
    sourceMessageId:
      typeof obj.sourceMessageId === "string" && obj.sourceMessageId.trim()
        ? obj.sourceMessageId.trim()
        : undefined,
    contextObjectId:
      typeof obj.contextObjectId === "string" && obj.contextObjectId.trim()
        ? obj.contextObjectId.trim()
        : undefined,
  };
}

// ── Knowledge retrieval ───────────────────────────────────────────────────────

/**
 * Fetch the org's active tone and policy entries (category = tone_guide | sop).
 * These are fed into Layer 2 of the prompt so the AI follows org-specific rules
 * instead of the hardcoded generic defaults.
 * Returns up to 4 entries, ordered by most-used in drafts.
 */
async function fetchOrgPolicyEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<{ title: string; body: string; category: string }[]> {
  try {
    const { data, error } = await supabase
      .from("knowledge_entries")
      .select("title, body, category")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .in("category", ["tone", "sop"])
      .order("used_in_drafts", { ascending: false })
      .limit(4);

    if (error || !data) return [];
    return data as { title: string; body: string; category: string }[];
  } catch {
    console.warn("[ai/draft] policy entry fetch failed — using defaults");
    return [];
  }
}

/**
 * Retrieve the top-k knowledge chunks relevant to a conversation.
 * Primary: semantic search via pgvector (match_knowledge_chunks RPC).
 * Fallback: full-text search on content_tsv (if embeddings unavailable).
 */
async function fetchKnowledgeSnippets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  subject: string,
  lastMessageBody: string,
  limit = 5
): Promise<KnowledgeSnippet[]> {
  const queryText = `${subject} ${lastMessageBody}`.slice(0, 1000);

  // ── 1. Try semantic search ──────────────────────────────────────────────
  try {
    const queryEmbedding = await generateEmbedding(queryText);

    const { data: semanticData, error: semanticErr } = await supabase.rpc(
      "match_knowledge_chunks",
      {
        query_embedding: queryEmbedding, // pass raw number[] — pgvector casts vector(1536) natively
        p_org_id: orgId,
        match_count: limit,
        min_similarity: 0.45,
      }
    );

    if (!semanticErr && semanticData && semanticData.length > 0) {
      // Fetch entry titles for matched chunks
      const entryIds = [...new Set((semanticData as { entry_id: string }[]).map((r) => r.entry_id))];
      const { data: entries } = await supabase
        .from("knowledge_entries")
        .select("id, title, category")
        .in("id", entryIds)
        .eq("is_active", true);

      const entryMap = Object.fromEntries(
        (entries ?? []).map((e: { id: string; title: string; category: string }) => [e.id, e])
      );

      return (semanticData as { id: string; entry_id: string; text: string; similarity: number }[]).map((row) => ({
        id: row.id,
        entryId: row.entry_id,
        title: entryMap[row.entry_id]?.title ?? "Knowledge entry",
        excerpt: row.text.slice(0, 400),
        entryType: entryMap[row.entry_id]?.category ?? "sop",
      }));
    }
  } catch (e) {
    console.warn("[ai/draft] semantic search failed, falling back to full-text:", e instanceof Error ? e.message : e);
  }

  // ── 2. Fallback: full-text search ───────────────────────────────────────
  try {
    const searchTerms = queryText.split(/\s+/).slice(0, 10).join(" ");

    const { data, error } = await supabase
      .from("knowledge_chunks")
      .select(`id, text, entry_id, knowledge_entries:entry_id (id, title, category, is_active)`)
      .textSearch("content_tsv", searchTerms, { type: "plain", config: "english" })
      .eq("org_id", orgId)
      .limit(limit);

    if (error || !data) return [];

    type RawChunk = {
      id: string;
      text: string;
      entry_id: string;
      knowledge_entries:
        | { id: string; title: string; category: string; is_active: boolean }[]
        | { id: string; title: string; category: string; is_active: boolean }
        | null;
    };

    return (data as unknown as RawChunk[])
      .map((row) => {
        const entry = Array.isArray(row.knowledge_entries)
          ? row.knowledge_entries[0]
          : row.knowledge_entries;
        // Exclude inactive knowledge entries from AI context
        if (!entry || entry.is_active === false) return null;
        const snippet: KnowledgeSnippet = {
          id: row.id,
          entryId: row.entry_id,
          title: entry.title ?? "Knowledge entry",
          excerpt: row.text.slice(0, 400),
          entryType: entry.category ?? "sop",
        };
        return snippet;
      })
      .filter((s): s is KnowledgeSnippet => s !== null);
  } catch {
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
  conversationId: string,
  orgId: string,
  selectedContext: ConversationContext["selectedContext"]
): Promise<ConversationContext> {
  // Fetch conversation + contact + company in one call.
  // org_id filter is applied at the application layer (in addition to RLS)
  // so a user from a different org cannot generate drafts for foreign conversations.
  const { data: convData, error: convErr } = await supabase
    .from("conversations")
    .select(`
      id, subject, status, risk_level,
      contacts ( full_name, email, tier, notes ),
      companies ( name, industry )
    `)
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (convErr || !convData) {
    if (convErr) console.error("[ai/draft] conversation lookup failed:", convErr.message);
    throw new Error("Conversation not found for this workspace.");
  }

  const conv = convData as unknown as DbConversationFull;

  // Fetch messages (last 20 to keep context window manageable)
  const { data: msgData, error: msgErr } = await supabase
    .from("messages")
    .select("id, sender_type, author_name, body_text, created_at")
    .eq("conversation_id", conversationId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (msgErr) {
    console.warn("[ai/draft] failed to fetch messages:", msgErr.message);
  }

  const messages: MessageContext[] = ((msgData ?? []) as DbMessage[]).map((m) => ({
    role: senderTypeToRole(m.sender_type),
    author: m.author_name ?? m.sender_type,
    // Cap individual message bodies to prevent context-window abuse by
    // a customer sending an extremely long message to inflate token usage.
    body: m.body_text.slice(0, 2000),
    sentAt: new Date(m.created_at).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  const lastInbound = [...messages].reverse().find((m) => m.role === "customer");
  const lastBody = lastInbound?.body ?? conv.subject ?? "";

  // Fetch knowledge snippets and org policy entries in parallel
  const [knowledgeSnippets, orgPolicyEntries] = await Promise.all([
    fetchKnowledgeSnippets(supabase, orgId, conv.subject ?? "", lastBody),
    fetchOrgPolicyEntries(supabase, orgId),
  ]);

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
    orgPolicyEntries,
    selectedContext,
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────

async function persistDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  sourceMessageId: string | undefined,
  userId: string,
  orgId: string,
  result: Awaited<ReturnType<typeof generateDraft>>,
  selectedContext: ConversationContext["selectedContext"],
  aiConfig: ResolvedAIConfig
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
      ai_mode: aiConfig.aiMode,
      prompt_version: result.promptVersion,
      context_object_id: selectedContext?.id ?? null,
      context_object_version_id: selectedContext?.versionId ?? null,
      request_tokens: result.requestTokens,
      response_tokens: result.responseTokens,
      latency_ms: result.latencyMs,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[ai/draft] persist failed:", error?.message ?? "No draft returned");
    return null;
  }

  return (data as { id: string }).id;
}

// ── AI action quota ───────────────────────────────────────────────────────────

const AI_ACTION_LIMITS: Record<string, number> = {
  free: 100,
  starter: 2_000,
  growth: 10_000,
};

/**
 * Returns { allowed, used, limit } for the org's current billing month.
 * Counts all AI-generating event types (drafts, summaries, edit analyses).
 * Falls back to free-tier limit if the plan is unknown.
 */
async function checkAIQuota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<{ allowed: boolean; used: number; limit: number; plan: string }> {
  // Get the org's current ai_plan
  const { data: org } = await supabase
    .from("organizations")
    .select("ai_plan")
    .eq("id", orgId)
    .maybeSingle();

  const plan = (org as { ai_plan?: string } | null)?.ai_plan ?? "free";
  const limit = AI_ACTION_LIMITS[plan] ?? AI_ACTION_LIMITS.free;

  // Count AI actions used in the current calendar month
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("event_type", ["ai_draft_generated", "ai_summary_generated", "edit_analysis_generated"])
    .gte("created_at", monthStart.toISOString());

  if (error) {
    // On quota check failure, allow the request through rather than blocking
    console.warn("[ai/draft] quota check failed — allowing request:", error.message);
    return { allowed: true, used: 0, limit, plan };
  }

  const used = count ?? 0;
  return { allowed: used < limit, used, limit, plan };
}

// ── Usage event ───────────────────────────────────────────────────────────────

async function emitUsageEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  conversationId: string,
  aiDraftId: string | null,
  result: Awaited<ReturnType<typeof generateDraft>>,
  aiConfig: ResolvedAIConfig,
  requestId: string,
  promptExperiment?: {
    experimentId: string | null;
    assignmentId: string | null;
    promptVersion: string;
    bucket: number | null;
    reason: string;
  }
) {
  const { error } = await supabase.from("usage_events").insert({
    org_id: orgId,
    user_id: userId,
    event_type: "ai_draft_generated",
    units: 1,
    metadata_json: {
      conversation_id: conversationId,
      ai_draft_id: aiDraftId,
      feature: "draft_generation",
      provider: result.provider,
      model: result.model,
      ai_mode: aiConfig.aiMode,
      provider_source: aiConfig.source,
      prompt_version: result.promptVersion,
      input_tokens: result.requestTokens ?? 0,
      output_tokens: result.responseTokens ?? 0,
      total_tokens: (result.requestTokens ?? 0) + (result.responseTokens ?? 0),
      estimated_cost: null,
      request_id: requestId,
      latency_ms: result.latencyMs,
      ...(promptExperiment ? { prompt_experiment: promptExperiment } : {}),
    },
  });

  if (error) throw error;
}

function mapDraftGenerationFailure(error: unknown) {
  if (error instanceof AISettingsError) {
    const mapped = mapAISettingsError(error);
    return { status: mapped.status, body: mapped.body };
  }

  const message = error instanceof Error ? error.message : "AI generation failed";
  const normalized = message.toLowerCase();

  if (normalized.includes("quota") || normalized.includes("insufficient_quota") || normalized.includes(" 429")) {
    return {
      status: 402,
      body: {
        code: "ai_provider_quota_exceeded",
        error: "The configured OpenAI account has no available quota.",
        hint: "Check the OpenAI account billing or switch AI setup in Settings -> AI.",
      },
    };
  }

  if (normalized.includes("invalid_api_key") || normalized.includes("incorrect api key") || normalized.includes(" 401")) {
    return {
      status: 401,
      body: {
        code: "ai_provider_invalid_key",
        error: "OpenAI rejected the configured API key.",
        hint: "Update the API key in Settings -> AI.",
      },
    };
  }

  if (normalized.includes("model") && (normalized.includes("not found") || normalized.includes("does not exist") || normalized.includes("unavailable"))) {
    return {
      status: 422,
      body: {
        code: "ai_model_unavailable",
        error: "The selected OpenAI model is not available.",
        hint: "Choose a supported model in Settings -> AI.",
      },
    };
  }

  if (normalized.includes("timeout") || normalized.includes("aborted") || normalized.includes("circuit")) {
    return {
      status: 504,
      body: {
        code: "ai_provider_timeout",
        error: "OpenAI did not respond in time.",
        hint: "Try again in a moment.",
      },
    };
  }

  return {
    status: 502,
    body: {
      code: "ai_generation_failed",
      error: "AI draft generation failed. Please try again.",
    },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const requestId = extractContextFromRequest(req).requestId ?? "req_unknown";
  const supabase = await createClient();

  const appUser = await getCurrentAppUser({ label: "ai/draft" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized", requestId }, { status: 401 });
  const denied = await requireCapability(appUser, "ai.generate", "ai/draft");
  if (denied) return denied;

  // Validate request
  let body: DraftRequestBody | null;
  try {
    body = validateBody(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", requestId }, { status: 400 });
  }

  if (!body) {
    return NextResponse.json(
      { error: "conversationId is required", requestId },
      { status: 422 }
    );
  }

  const { conversationId, sourceMessageId, contextObjectId } = body;

  if (sourceMessageId) {
    const { data: sourceMessage, error: sourceMessageError } = await supabase
      .from("messages")
      .select("id")
      .eq("id", sourceMessageId)
      .eq("conversation_id", conversationId)
      .eq("org_id", appUser.org_id)
      .maybeSingle();

    if (sourceMessageError) {
      console.error("[ai/draft] source message lookup failed:", sourceMessageError.message);
      return NextResponse.json({ error: "Unable to verify the source message.", requestId }, { status: 500 });
    }

    if (!sourceMessage) {
      return NextResponse.json(
        { error: "Source message not found for this conversation.", requestId },
        { status: 400 }
      );
    }
  }

  let aiConfig: ResolvedAIConfig;
  try {
    aiConfig = await resolveOrgAIConfig(supabase, appUser.org_id);
  } catch (error) {
    const mapped = mapAISettingsError(error);
    return NextResponse.json({ ...mapped.body, requestId }, { status: mapped.status });
  }

  // Check AI action quota before touching OpenAI
  const quota = await checkAIQuota(supabase, appUser.org_id);
  if (!quota.allowed) {
    return NextResponse.json(
    {
      error: "AI action limit reached",
        detail: `Your ${quota.plan} plan includes ${quota.limit} AI actions per month. You have used ${quota.used}. Upgrade to continue.`,
        used: quota.used,
        limit: quota.limit,
        plan: quota.plan,
        requestId,
      },
      { status: 402 }
    );
  }

  const selectedContext = contextObjectId
    ? await resolveDraftContextSelection({
        supabase,
        orgId: appUser.org_id,
        contextObjectId,
      })
    : null;

  if (contextObjectId && !selectedContext) {
    return NextResponse.json(
      { error: "Selected context is not available for this workspace.", requestId },
      { status: 404 }
    );
  }

  // Assemble context
  let context: ConversationContext;
  try {
    context = await assembleContext(supabase, conversationId, appUser.org_id, selectedContext);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load conversation";
    return NextResponse.json({ error: message, requestId }, { status: 404 });
  }

  const promptAssignment = await assignPromptVersion({
    db: supabase,
    orgId: appUser.org_id,
    conversationId,
  });

  // Generate draft
  let result: Awaited<ReturnType<typeof generateDraft>>;
  try {
    result = await generateDraft({
      context,
      provider: aiConfig.provider,
      model: aiConfig.model,
      apiKey: aiConfig.apiKey,
      aiMode: aiConfig.aiMode,
      promptVersion: promptAssignment.promptVersion || PROMPT_VERSION,
      promptConfig: promptAssignment.promptConfig,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    console.error("[ai/draft] generation error:", {
      requestId,
      orgId: appUser.org_id,
      conversationId,
      provider: aiConfig.provider,
      model: aiConfig.model,
      aiMode: aiConfig.aiMode,
      message,
    });
    const mapped = mapDraftGenerationFailure(err);
    return NextResponse.json(
      { ...mapped.body, requestId },
      { status: mapped.status }
    );
  }

  // Persist draft (non-fatal if it fails — still return the draft)
  const draftId = await persistDraft(
    supabase,
    conversationId,
    sourceMessageId,
    appUser.id,
    appUser.org_id,
    result,
    selectedContext,
    aiConfig
  );

  await linkPromptAssignmentToDraft({
    orgId: appUser.org_id,
    assignmentId: promptAssignment.assignmentId,
    draftId,
  });

  // Increment used_in_drafts for every knowledge entry that contributed to this draft.
  // Collect unique entry IDs from both snippet retrieval and policy/tone entries.
  // The policy entries don't carry IDs so we look them up by title (best-effort, fire-and-forget).
  const snippetEntryIds = [
    ...new Set(context.knowledgeSnippets.map((s) => s.entryId).filter((id): id is string => Boolean(id))),
  ];
  if (snippetEntryIds.length > 0) {
    after(async () => {
      const { error: rpcErr } = await supabase.rpc("increment_knowledge_used_in_drafts", { entry_ids: snippetEntryIds });
        if (rpcErr) console.warn("[ai/draft] used_in_drafts increment failed:", rpcErr.message);
    });
  }

  after(async () => {
    try {
      await emitUsageEvent(
        supabase,
        appUser.org_id,
        appUser.id,
        conversationId,
        draftId,
        result,
        aiConfig,
        requestId,
        {
          experimentId: promptAssignment.experimentId,
          assignmentId: promptAssignment.assignmentId,
          promptVersion: promptAssignment.promptVersion,
          bucket: promptAssignment.bucket,
          reason: promptAssignment.reason,
        }
      );
    } catch (e: unknown) {
      console.warn("[ai/draft] usage event failed:", e instanceof Error ? e.message : e);
    }
  });

  after(async () => {
    await emitWorkflowEvent({
      orgId: appUser.org_id,
      eventType: "draft.generated",
      aggregateType: draftId ? "ai_draft" : "conversation",
      aggregateId: draftId ?? conversationId,
      conversationId,
      actorId: appUser.id,
      source: "api.ai.draft",
      payload: {
        draftId,
        sourceMessageId: sourceMessageId ?? null,
        confidenceLevel: result.confidenceLevel,
        riskFlags: result.riskFlags,
        missingContext: result.missingContext,
        recommendedTags: result.recommendedTags,
        provider: result.provider,
        model: result.model,
        aiMode: aiConfig.aiMode,
        promptVersion: result.promptVersion,
        contextObjectId: selectedContext?.id ?? null,
        contextObjectVersionId: selectedContext?.versionId ?? null,
        promptExperiment: {
          experimentId: promptAssignment.experimentId,
          assignmentId: promptAssignment.assignmentId,
          bucket: promptAssignment.bucket,
          reason: promptAssignment.reason,
        },
        latencyMs: result.latencyMs,
      },
    });
  });

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
      aiMode: aiConfig.aiMode,
      promptVersion: result.promptVersion,
      selectedContext: selectedContext
        ? {
            id: selectedContext.id,
            versionId: selectedContext.versionId,
            title: selectedContext.title,
            versionNumber: selectedContext.versionNumber,
            category: selectedContext.category,
          }
        : null,
      promptExperiment: {
        experimentId: promptAssignment.experimentId,
        assignmentId: promptAssignment.assignmentId,
        bucket: promptAssignment.bucket,
        reason: promptAssignment.reason,
      },
      latencyMs: result.latencyMs,
    },
  });
}

