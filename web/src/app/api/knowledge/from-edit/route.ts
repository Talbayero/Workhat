import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding, chunkText } from "@/lib/embeddings";
import { entryFromCorrection } from "@/lib/ai/knowledge-gen";
import { getCurrentAppUser } from "@/lib/auth/app-user";

/* ─────────────────────────────────────────────
   POST /api/knowledge/from-edit

   Body: { aiDraftId: string; sentReplyId: string }

   Flow:
     1. Fetch ai_drafts + sent_replies + edit_analyses records
     2. Call entryFromCorrection() via gpt-4o-mini
     3. Insert result as an INACTIVE knowledge_entry (review before it goes live)
     4. Return { entryId }

   Only agents who can see the conversation can trigger this.
   The entry is created with is_active=false so a manager must review it.
───────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "from-edit", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const aiDraftId = typeof body.aiDraftId === "string" ? body.aiDraftId.trim() : "";
  const sentReplyId = typeof body.sentReplyId === "string" ? body.sentReplyId.trim() : "";

  if (!aiDraftId || !sentReplyId) {
    return NextResponse.json(
      { error: "aiDraftId and sentReplyId are required." },
      { status: 400 }
    );
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[from-edit] admin client init failed:", message);
    return NextResponse.json(
      { error: "Knowledge generation is unavailable — admin database key is not configured." },
      { status: 503 }
    );
  }

  // ── Fetch all three records in parallel ──────────────────────────────────
  const [draftResult, replyResult, analysisResult] = await Promise.all([
    admin
      .from("ai_drafts")
      .select("id, org_id, conversation_id, draft_text")
      .eq("id", aiDraftId)
      .eq("org_id", appUser.org_id)
      .maybeSingle(),

    admin
      .from("sent_replies")
      .select("id, org_id, conversation_id, source_ai_draft_id, body_text")
      .eq("id", sentReplyId)
      .eq("org_id", appUser.org_id)
      .maybeSingle(),

    // edit_analyses may not exist yet if the after() task hasn't run
    admin
      .from("edit_analyses")
      .select("id, ai_draft_id, conversation_id, categories, likely_reason_summary")
      .eq("sent_reply_id", sentReplyId)
      .eq("org_id", appUser.org_id)
      .maybeSingle(),
  ]);

  if (draftResult.error || !draftResult.data) {
    return NextResponse.json({ error: "AI draft not found." }, { status: 404 });
  }
  if (replyResult.error || !replyResult.data) {
    return NextResponse.json({ error: "Sent reply not found." }, { status: 404 });
  }

  if (draftResult.data.conversation_id !== replyResult.data.conversation_id) {
    return NextResponse.json(
      { error: "AI draft and sent reply do not belong to the same conversation." },
      { status: 400 }
    );
  }

  if (
    replyResult.data.source_ai_draft_id &&
    replyResult.data.source_ai_draft_id !== draftResult.data.id
  ) {
    return NextResponse.json(
      { error: "Sent reply is linked to a different AI draft." },
      { status: 400 }
    );
  }

  if (
    analysisResult.data &&
    (analysisResult.data.ai_draft_id !== draftResult.data.id ||
      analysisResult.data.conversation_id !== draftResult.data.conversation_id)
  ) {
    return NextResponse.json(
      { error: "Edit analysis does not match the submitted draft and reply." },
      { status: 400 }
    );
  }

  const draftText = draftResult.data.draft_text;
  const finalText = replyResult.data.body_text;

  // Use edit analysis data if available, otherwise fall back to empty defaults
  const analysis = analysisResult.data;
  const categories: string[] = Array.isArray(analysis?.categories)
    ? analysis.categories.filter((category): category is string => typeof category === "string")
    : [];
  const likelyReason = typeof analysis?.likely_reason_summary === "string"
    ? analysis.likely_reason_summary
    : "";

  // ── Generate knowledge entry via LLM ────────────────────────────────────
  let generated;
  try {
    generated = await entryFromCorrection(draftText, finalText, likelyReason, categories);
  } catch (err) {
    console.error("[from-edit] entryFromCorrection failed:", err);
    return NextResponse.json(
      { error: "Failed to generate knowledge entry. Please try again." },
      { status: 502 }
    );
  }

  // ── Persist inactive entry ───────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const updatedBy = user?.email?.split("@")[0] ?? "agent";

  const { data: entry, error: insertErr } = await admin
    .from("knowledge_entries")
    .insert({
      org_id: appUser.org_id,
      title: generated.title,
      summary: generated.summary,
      body: generated.body,
      category: generated.category,
      tags: generated.tags,
      used_in_drafts: 0,
      is_active: false, // must be reviewed before going live
      last_updated: new Date().toISOString().split("T")[0],
      updated_by: updatedBy,
    })
    .select("id")
    .single();

  if (insertErr || !entry) {
    console.error("[from-edit] insert failed:", insertErr);
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to save knowledge entry." },
      { status: 500 }
    );
  }

  // ── Auto-chunk and embed (best-effort) ───────────────────────────────────
  const chunks = chunkText(generated.body);
  await Promise.allSettled(
    chunks.map(async (text, i) => {
      let embedding: number[] | null = null;
      try {
        embedding = await generateEmbedding(text);
      } catch {
        console.warn(`[from-edit] Embedding failed for chunk ${i}`);
      }
      const { error: chunkError } = await admin.from("knowledge_chunks").insert({
        entry_id: entry.id,
        org_id: appUser.org_id,
        chunk_index: i,
        text,
        ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
      });
      if (chunkError) console.warn(`[from-edit] Chunk insert failed for chunk ${i}:`, chunkError.message);
    })
  );

  return NextResponse.json({ entryId: entry.id }, { status: 201 });
}
