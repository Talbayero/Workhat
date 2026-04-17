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
    editAnalysisId?: string;
  };

  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.conversationId) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }
  if (!body.result || !VALID_RESULTS.has(body.result)) {
    return NextResponse.json({ error: "result must be approved, flagged, or needs_revision." }, { status: 422 });
  }

  const score = normalizeScore(body.score);
  if (score === undefined) {
    return NextResponse.json({ error: "score must be a number from 0 to 100." }, { status: 422 });
  }

  const supabase = await createClient();

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", body.conversationId)
    .eq("org_id", appUser.org_id)
    .single();

  if (conversationError || !conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  if (body.editAnalysisId) {
    const { data: analysis, error: analysisError } = await supabase
      .from("edit_analyses")
      .select("id")
      .eq("id", body.editAnalysisId)
      .eq("conversation_id", body.conversationId)
      .eq("org_id", appUser.org_id)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json({ error: "Edit analysis not found for this conversation." }, { status: 404 });
    }
  }

  const { data, error } = await supabase
    .from("qa_reviews")
    .insert({
      org_id: appUser.org_id,
      conversation_id: body.conversationId,
      reviewer_user_id: appUser.id,
      result: body.result,
      score,
      notes: body.notes?.trim().slice(0, 4000) || null,
      edit_analysis_id: body.editAnalysisId ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const riskUpdate =
    body.result === "approved"
      ? "green"
      : body.result === "flagged"
        ? "red"
        : "yellow";

  await supabase
    .from("conversations")
    .update({ risk_level: riskUpdate })
    .eq("id", body.conversationId)
    .eq("org_id", appUser.org_id);

  return NextResponse.json({ ok: true, id: (data as { id: string }).id }, { status: 201 });
}