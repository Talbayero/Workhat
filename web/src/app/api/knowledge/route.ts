import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding, chunkText } from "@/lib/embeddings";
import { getCurrentAppUser } from "@/lib/auth/app-user";

/* ─────────────────────────────────────────────
   GET  /api/knowledge  — list entries for org
   POST /api/knowledge  — create new entry
───────────────────────────────────────────── */

function normalizeOptionalString(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function normalizeTags(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    return null;
  }

  return [...new Set(value.map((tag) => tag.trim()).filter(Boolean))];
}

function getAdminOrResponse() {
  try {
    return { admin: createAdminClient(), response: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[knowledge] admin client init failed:", message);
    return {
      admin: null,
      response: NextResponse.json(
        { error: "Knowledge management is unavailable — admin database key is not configured." },
        { status: 503 }
      ),
    };
  }
}

export async function GET() {
  const appUser = await getCurrentAppUser({ label: "knowledge", select: "id, org_id, role" });
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
  const appUser = await getCurrentAppUser({ label: "knowledge", select: "id, org_id, role, email" });
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

  const title = normalizeOptionalString(body.title);
  const summary = normalizeOptionalString(body.summary);
  const content = normalizeOptionalString(body.body);
  const category = normalizeOptionalString(body.category);
  const tags = normalizeTags(body.tags);

  if (title === undefined) return NextResponse.json({ error: "Title must be text." }, { status: 400 });
  if (summary === undefined) return NextResponse.json({ error: "Summary must be text." }, { status: 400 });
  if (content === undefined) return NextResponse.json({ error: "Body must be text." }, { status: 400 });
  if (category === undefined) return NextResponse.json({ error: "Category must be text." }, { status: 400 });
  if (tags === null) return NextResponse.json({ error: "Tags must be a list of text values." }, { status: 400 });

  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Body content is required." }, { status: 400 });
  if (!category) return NextResponse.json({ error: "Category is required." }, { status: 400 });

  const { admin, response } = getAdminOrResponse();
  if (!admin) return response;

  // Use email from the already-resolved app user — avoids a second auth round-trip
  const updatedBy = (appUser as { email?: string }).email?.split("@")[0] ?? "agent";

  // Create the entry
  const { data: entry, error: entryErr } = await admin
    .from("knowledge_entries")
    .insert({
      org_id: appUser.org_id,
      title,
      summary: summary || title,
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

      const { error: chunkError } = await admin.from("knowledge_chunks").insert({
        entry_id: entry.id,
        org_id: appUser.org_id,
        chunk_index: i,
        text: chunkText,
        // content_tsv is a generated column — DB handles it automatically
        ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
      });
      if (chunkError) console.warn(`[knowledge] Chunk insert failed for chunk ${i}:`, chunkError.message);
    })
  );

  return NextResponse.json({ entry: { id: entry.id } }, { status: 201 });
}
