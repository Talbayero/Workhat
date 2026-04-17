import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/qa-reviews - submit a QA review for a conversation */

type AppUser = {
  id: string;
  org_id: string;
  role: string;
};

const REVIEW_ROLES = new Set(["admin", "manager", "qa_reviewer"]);
const VALID_RESULTS = new Set(["approved", "flagged", "needs_revision"]);
const VALID_CATEGORIES = new Set([
  "missing_context",
  "policy_risk",
  "accuracy",
  "tone",
  "escalation",
]);

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .single();

  return data as AppUser | null;
}

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
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!REVIEW_ROLES.has(appUser.role)) {
    return NextResponse.json({ error: "Only admins, managers, and QA reviewers can submit QA reviews." }, { status: 403 });
  }

  let body: {
    conversationId?: string;
    result?: string;
    score?: unknown;
    notes?: string;
    categories?: unknown;
    editAnalysisId?: string;
  };

  try {
    body = await req.json() as typeof body;
  } catch {
     return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { conversationId, result, score, notes, categories, editAnalysisId } = body;

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }
  if (!result || !VALID_RESULTS.has(result)) {
    return NextResponse.json({ error: "result must be one of: approved, flagged, needs_revision." }, { status: 400 });
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

  const { data, error } = await supabase
    .from("qa_reviews")
    .insert({
      org_id: appUser.org_id,
      conversation_id: conversationId,
      reviewed_by: appUser.id,
      result,
      score: normalizedScore,
      notes: notes?.trim() ?? null,
      categories: normalizedCategories,
      edit_analysis_id: editAnalysisId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reviewId: data.id }, { status: 201 });
}
