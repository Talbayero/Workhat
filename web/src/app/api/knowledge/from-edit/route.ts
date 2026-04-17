import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding, chunkText } from "@/lib/embeddings";
import { entryFromCorrection } from "@/lib/ai/knowledge-gen";

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

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .single();
  return data as { id: string; org_id: string; role: string } | null;
}

export async function POST(req: NextRequest) {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { aiDraftId?: string; sentReplyId?: string };
  const { aiDraftId, sentReplyId } = body;

  if (!aiDraftId || !sentReplyId) {
    return NextResponse.json(
      { error: "aiDraftId and sentReplyId are required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // ── Fetch all three records in parallel ──────────────────────────────────
  const [draftResult, replyResult, analysisResult] = await Promise.all([
    admin
      .from("ai_drafts")
      .select("id, org_id, draft_text")
      .eq("id", aiDraftId)
      .eq("org_id", appUser.org_id)
      .single(),

    admin
      .from("sent_replies")
      .select("id, org_id, body_text")
      .eq("id", sentReplyId)
      .eq("org_id", appUser.org_id)
      .single(),

    // edit_analyses may not exist yet if the after() task hasn't run
    admin
      .from("edit_analyses")
      .select("id, categories, likely_reason_summary")
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

  const draftText = draftResult.data.draft_text;
  const finalText = replyResult.data.body_text;

  // Use edit analysis data if available, otherwise fall back to empty defaults
  const analysis = analysisResult.data;
  const categories: string[] = Array.isArray(analysis?.categories)
    ? (analysis.categories as string[])
    : [];
  const likelyReason: string = analysis?.likely_reason_summary ?? "";

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
      await admin.from("knowledge_chunks").insert({
        entry_id: entry.id,
        org_id: appUser.org_id,
        chunk_index: i,
        text,
        ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
      });
    })
  );

  return NextResponse.json({ entryId: entry.id }, { status: 201 });
}
