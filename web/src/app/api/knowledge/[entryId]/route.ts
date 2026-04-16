import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding, chunkText } from "@/lib/embeddings";

/* ─────────────────────────────────────────────
   GET    /api/knowledge/:id  — fetch single entry
   PATCH  /api/knowledge/:id  — update entry
   DELETE /api/knowledge/:id  — delete entry
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
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ entry: data });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { entryId } = await ctx.params;
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    title?: string;
    summary?: string;
    body?: string;
    category?: string;
    tags?: string[];
    is_active?: boolean;
  };

  const admin = createAdminClient();

  // Verify ownership
  const { data: existing } = await admin
    .from("knowledge_entries")
    .select("id")
    .eq("id", entryId)
    .eq("org_id", appUser.org_id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const updatedBy = user?.email?.split("@")[0] ?? "agent";

  const updates: Record<string, unknown> = {
    last_updated: new Date().toISOString().split("T")[0],
    updated_by: updatedBy,
  };
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.summary !== undefined) updates.summary = body.summary.trim();
  if (body.body !== undefined) updates.body = body.body.trim();
  if (body.category !== undefined) updates.category = body.category.trim();
  if (body.tags !== undefined) updates.tags = body.tags;
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

  const { error: updateErr } = await admin
    .from("knowledge_entries")
    .update(updates)
    .eq("id", entryId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // If body changed, re-chunk and re-embed
  if (body.body !== undefined) {
    const content = body.body.trim();

    // Delete old chunks
    await admin.from("knowledge_chunks").delete().eq("entry_id", entryId);

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

        await admin.from("knowledge_chunks").insert({
          entry_id: entryId,
          org_id: appUser.org_id,
          chunk_index: i,
          text,
          // content_tsv is a generated column
          ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
        });
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

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("knowledge_entries")
    .select("id")
    .eq("id", entryId)
    .eq("org_id", appUser.org_id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Chunks will cascade-delete via FK
  const { error } = await admin
    .from("knowledge_entries")
    .delete()
    .eq("id", entryId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
