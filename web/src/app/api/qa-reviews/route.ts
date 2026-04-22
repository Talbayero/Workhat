import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/security/audit-logger";

/* POST /api/qa-reviews - submit a QA review for a conversation */

type AppUser = {
  id: string;
  org_id: string;
  role: string;
};

const MAX_NOTES_LENGTH = 2000;
const VALID_RESULTS = new Set(["approved", "flagged", "needs_revision"]);
const VALID_CATEGORIES = new Set([
  "missing_context",
  "policy_risk",
  "accuracy",
  "tone",
  "escalation",
]);

function normalizeScore(score: unknown) {
  if (score === undefined || score === null || score === "") return null;
  const value = Number(score);
  if (!Number.isFinite(value) || value < 0 || value > 100) return undefined;
  return value;
}

function normalizeCategories(categories: unknown) {
  if (categories === undefined || categories === null) return [];
  if (!Array.isArray(categories)) return undefined;

  const normalized = Array.from(new Set(
    categories
      .filter((category): category is string => typeof category === "string")
      .map((category) => category.trim())
      .filter((category) => VALID_CATEGORIES.has(category))
  ));

  return normalized.slice(0, 12);
}

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser<AppUser>({ label: "qa-reviews" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireCapability(appUser, "qa.review", "qa-reviews");
  if (denied) return denied;

  let body: {
    conversationId?: unknown;
    result?: unknown;
    score?: unknown;
    notes?: unknown;
    categories?: unknown;
    editAnalysisId?: unknown;
  };

  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
     return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { conversationId, result, score, notes, categories, editAnalysisId } = body;

  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }
  if (typeof result !== "string" || !VALID_RESULTS.has(result)) {
    return NextResponse.json({ error: "result must be one of: approved, flagged, needs_revision." }, { status: 400 });
  }
  if (notes != null && typeof notes !== "string") {
    return NextResponse.json({ error: "notes must be text." }, { status: 400 });
  }
  if (typeof notes === "string" && notes.trim().length > MAX_NOTES_LENGTH) {
    return NextResponse.json({ error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.` }, { status: 422 });
  }
  if (editAnalysisId != null && (typeof editAnalysisId !== "string" || !editAnalysisId.trim())) {
    return NextResponse.json({ error: "editAnalysisId must be text." }, { status: 400 });
  }

  const normalizedScore = normalizeScore(score);
  if (normalizedScore === undefined) {
    return NextResponse.json({ error: "score must be a number between 0 and 100." }, { status: 400 });
  }

  const normalizedCategories = normalizeCategories(categories);
  if (normalizedCategories === undefined) {
    return NextResponse.json({ error: "categories must be an array of valid category strings." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("org_id", appUser.org_id)
    .maybeSingle();

  if (conversationError) {
    console.error("[qa-reviews] conversation lookup failed:", conversationError.message);
    return NextResponse.json({ error: "Unable to verify this conversation." }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found for this workspace." }, { status: 404 });
  }

  if (editAnalysisId) {
    const { data: analysis, error: analysisError } = await supabase
      .from("edit_analyses")
      .select("id")
      .eq("id", editAnalysisId)
      .eq("conversation_id", conversationId)
      .eq("org_id", appUser.org_id)
      .maybeSingle();

    if (analysisError) {
      console.error("[qa-reviews] edit analysis lookup failed:", analysisError.message);
      return NextResponse.json({ error: "Unable to verify the edit analysis." }, { status: 500 });
    }

    if (!analysis) {
      return NextResponse.json({ error: "Edit analysis not found for this conversation." }, { status: 404 });
    }
  }

  const { data, error } = await supabase
    .from("qa_reviews")
    .insert({
      org_id: appUser.org_id,
      conversation_id: conversation.id,
      reviewed_by: appUser.id,
      result,
      score: normalizedScore,
      notes: notes?.trim() ?? null,
      categories: normalizedCategories,
      edit_analysis_id: editAnalysisId?.trim() ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[qa-reviews] review insert failed:", error?.message ?? "No review returned");
    return NextResponse.json({ error: "Unable to save the QA review." }, { status: 500 });
  }

  void logAudit({
    action: "qa.review_submitted",
    orgId: appUser.org_id,
    actorId: appUser.id,
    actorRole: appUser.role,
    resourceType: "qa_review",
    resourceId: data.id,
    resourceLabel: conversationId as string,
    newValues: { result, score: normalizedScore, categories: normalizedCategories },
    req,
  });
  return NextResponse.json({ ok: true, reviewId: data.id }, { status: 201 });
}
