import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { entryFromGapPattern } from "@/lib/ai/knowledge-gen";
import type { GeneratedKnowledgeEntry } from "@/lib/ai/knowledge-gen";

/* ─────────────────────────────────────────────
   GET /api/knowledge/gaps

   Returns AI-generated knowledge entry suggestions for recurring edit
   patterns detected in the last 30 days. Each suggestion represents a
   systemic gap in the knowledge base — something the AI gets wrong
   repeatedly that a single well-written entry could fix.

   Response shape:
   {
     suggestions: Array<{
       category: string;
       count: number;
       sampleReasons: string[];
       suggested: GeneratedKnowledgeEntry;
     }>
   }

   Access: any authenticated agent (read-only).
   Threshold: patterns with >= MIN_OCCURRENCES edits in the window.
   Performance: LLM calls are made in parallel — up to MAX_PATTERNS.
───────────────────────────────────────────── */

const MIN_OCCURRENCES = 3;  // minimum edits to surface a pattern
const MAX_PATTERNS = 5;     // cap to keep LLM cost predictable
const SAMPLE_REASONS = 5;   // reasons to pass into the LLM prompt

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

  const admin = createAdminClient();

  // ── Fetch last 30 days of edit analyses ──────────────────────────────────
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: analyses, error } = await admin
    .from("edit_analyses")
    .select("categories, likely_reason_summary")
    .eq("org_id", appUser.org_id)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!analyses || analyses.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // ── Group by dominant category ────────────────────────────────────────────
  // Each analysis has a `categories` jsonb array, e.g. ["tone", "policy"].
  // We attribute the analysis to the *first* (most confident) category.
  const categoryMap = new Map<string, { count: number; reasons: string[] }>();

  for (const analysis of analyses) {
    const cats = Array.isArray(analysis.categories) ? (analysis.categories as string[]) : [];
    const primaryCategory = cats[0] ?? "other";
    const reason = (analysis.likely_reason_summary as string | null) ?? "";

    const existing = categoryMap.get(primaryCategory);
    if (existing) {
      existing.count++;
      if (reason && existing.reasons.length < SAMPLE_REASONS) {
        existing.reasons.push(reason);
      }
    } else {
      categoryMap.set(primaryCategory, {
        count: 1,
        reasons: reason ? [reason] : [],
      });
    }
  }

  // ── Filter to significant patterns and sort by frequency ─────────────────
  const patterns = [...categoryMap.entries()]
    .filter(([, v]) => v.count >= MIN_OCCURRENCES)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, MAX_PATTERNS)
    .map(([category, v]) => ({
      category,
      count: v.count,
      sampleReasons: v.reasons,
    }));

  if (patterns.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // ── Generate knowledge entry suggestions in parallel ──────────────────────
  const results = await Promise.allSettled(
    patterns.map(async (pattern) => {
      const suggested = await entryFromGapPattern(pattern);
      return { ...pattern, suggested };
    })
  );

  const suggestions = results
    .filter((r): r is PromiseFulfilledResult<{
      category: string;
      count: number;
      sampleReasons: string[];
      suggested: GeneratedKnowledgeEntry;
    }> => r.status === "fulfilled")
    .map((r) => r.value);

  return NextResponse.json({ suggestions });
}
