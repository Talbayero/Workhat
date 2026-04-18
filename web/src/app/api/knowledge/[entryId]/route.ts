import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding, chunkText } from "@/lib/embeddings";

/* ─────────────────────────────────────────────
   GET    /api/knowledge/:id  — fetch single entry
   PATCH  /api/knowledge/:id  — update entry
   DELETE /api/knowledge/:id  — delete entry
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
    console.error("[knowledge/:id] admin client init failed:", message);
    return {
      admin: null,
      response: NextResponse.json(
        { error: "Knowledge management is unavailable — admin database key is not configured." },
        { status: 503 }
      ),
    };
  }
}

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[knowledge/:id] app user lookup failed:", error.message);
    return null;
  }

  return data as { id: string; org_id: string; role: string } | null;
}

type RouteContext = { params: Promise<{ entryId: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { entryId } = await ctx.params;
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_entries")
    .select(`id, title, summary, body, category, tags, used_in_drafts, last_updated, updated_by,
             knowledge_chunks(id, chunk_index, text)`)
    .eq("id", entryId)
    .eq("org_id", appUser.org_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ entry: data });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { entryId } = await ctx.params;
  const appUser = await getAppUser();
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

  const { admin, response } = getAdminOrResponse();
  if (!admin) return response;

  // Verify ownership
  const { data: existing, error: existingError } = await admin
    .from("knowledge_entries")
    .select("id")
    .eq("id", entryId)
    .eq("org_id", appUser.org_id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const updatedBy = user?.email?.split("@")[0] ?? "agent";

  const updates: Record<string, unknown> = {
    last_updated: new Date().toISOString().split("T")[0],
    updated_by: updatedBy,
  };
  if ("title" in body) {
    const title = normalizeOptionalString(body.title);
    if (!title) return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    updates.title = title;
  }
  if ("summary" in body) {
    const summary = normalizeOptionalString(body.summary);
    if (summary === undefined) return NextResponse.json({ error: "Summary must be text." }, { status: 400 });
    updates.summary = summary ?? "";
  }
  if ("body" in body) {
    const content = normalizeOptionalString(body.body);
    if (!content) return NextResponse.json({ error: "Body content cannot be empty." }, { status: 400 });
    updates.body = content;
  }
  if ("category" in body) {
    const category = normalizeOptionalString(body.category);
    if (!category) return NextResponse.json({ error: "Category cannot be empty." }, { status: 400 });
    updates.category = category;
  }
  if ("tags" in body) {
    const tags = normalizeTags(body.tags);
    if (tags === null) return NextResponse.json({ error: "Tags must be a list of text values." }, { status: 400 });
    updates.tags = tags;
  }
  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active must be boolean." }, { status: 400 });
    }
    updates.is_active = body.is_active;
  }

  const { error: updateErr } = await admin
    .from("knowledge_entries")
    .update(updates)
    .eq("id", entryId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // If body changed, re-chunk and re-embed
  if ("body" in updates) {
    const content = updates.body as string;

    // Delete old chunks
    const { error: deleteChunksError } = await admin.from("knowledge_chunks").delete().eq("entry_id", entryId);
    if (deleteChunksError) {
      return NextResponse.json({ error: deleteChunksError.message }, { status: 500 });
    }

    // Re-create with new chunks
    const chunks = chunkText(content);
    await Promise.allSettled(
      chunks.map(async (text, i) => {
        let embedding: number[] | null = null;
        try {
          embedding = await generateEmbedding(text);
        } catch {
          console.warn(`[knowledge] Re-embed failed for chunk ${i}`);
        }

        const { error: chunkError } = await admin.from("knowledge_chunks").insert({
          entry_id: entryId,
          org_id: appUser.org_id,
          chunk_index: i,
          text,
          // content_tsv is a generated column
          ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
        });
        if (chunkError) console.warn(`[knowledge/:id] Chunk insert failed for chunk ${i}:`, chunkError.message);
      })
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { entryId } = await ctx.params;
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admins and managers can delete knowledge entries
  if (!["admin", "manager"].includes(appUser.role)) {
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
  }

  const { admin, response } = getAdminOrResponse();
  if (!admin) return response;

  const { data: existing, error: existingError } = await admin
    .from("knowledge_entries")
    .select("id")
    .eq("id", entryId)
    .eq("org_id", appUser.org_id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Chunks will cascade-delete via FK
  const { error } = await admin
    .from("knowledge_entries")
    .delete()
    .eq("id", entryId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
