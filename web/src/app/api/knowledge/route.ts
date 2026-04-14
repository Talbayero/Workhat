import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding, chunkText } from "@/lib/embeddings";

/* ─────────────────────────────────────────────
   GET  /api/knowledge  — list entries for org
   POST /api/knowledge  — create new entry
───────────────────────────────────────────── */

// ── Auth helper ────────────────────────────────────────────────────────────
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

export async function GET() {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_entries")
    .select("id, title, summary, category, tags, used_in_drafts, last_updated, updated_by")
    .eq("org_id", appUser.org_id)
    .order("used_in_drafts", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    title?: string;
    summary?: string;
    body?: string;
    category?: string;
    tags?: string[];
  };

  const title = body.title?.trim();
  const summary = body.summary?.trim();
  const content = body.body?.trim();
  const category = body.category?.trim();
  const tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : [];

  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Body content is required." }, { status: 400 });
  if (!category) return NextResponse.json({ error: "Category is required." }, { status: 400 });

  const admin = createAdminClient();

  // Get the agent's display name for updated_by
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const updatedBy = user?.email?.split("@")[0] ?? "agent";

  // Create the entry
  const { data: entry, error: entryErr } = await admin
    .from("knowledge_entries")
    .insert({
      org_id: appUser.org_id,
      title,
      summary: summary ?? title,
      body: content,
      category,
      tags,
      used_in_drafts: 0,
      last_updated: new Date().toISOString().split("T")[0],
      updated_by: updatedBy,
    })
    .select("id")
    .single();

  if (entryErr || !entry) {
    return NextResponse.json({ error: entryErr?.message ?? "Failed to create entry" }, { status: 500 });
  }

  // Auto-chunk the body and create knowledge_chunks with embeddings
  const chunks = chunkText(content);
  await Promise.allSettled(
    chunks.map(async (chunkText, i) => {
      // Generate embedding (best-effort — don't fail entry creation if this fails)
      let embedding: number[] | null = null;
      try {
        embedding = await generateEmbedding(chunkText);
      } catch (e) {
        console.warn(`[knowledge] Embedding failed for chunk ${i}:`, e);
      }

      await admin.from("knowledge_chunks").insert({
        entry_id: entry.id,
        org_id: appUser.org_id,
        chunk_index: i,
        text: chunkText,
        // content_tsv is a generated column — DB handles it automatically
        ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
      });
    })
  );

  return NextResponse.json({ entry: { id: entry.id } }, { status: 201 });
}
