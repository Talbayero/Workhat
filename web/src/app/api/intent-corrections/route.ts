import { after, NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { suggestKeywordsFromCorrection } from "@/lib/ai/intent-classifier";

/* ─────────────────────────────────────────────
   POST /api/intent-corrections
   Logged when an agent resolves a conversation and confirms or corrects
   the auto-classified intent.

   Body: {
     conversationId: string;
     originalIntent: string;    // what the system assigned
     correctedIntent: string;   // what the agent confirmed/changed it to
     closureNote?: string;      // the agent's resolution note
   }

   After logging, fires an async AI job to suggest keywords for the
   corrected intent if the intent was actually changed.

   GET /api/intent-corrections
   Returns corrections log for manager review, grouped by pattern.
   Access: manager / admin / qa_reviewer.
───────────────────────────────────────────── */

type IntentCorrectionPayload = {
  conversationId: string;
  originalIntent: string;
  correctedIntent: string;
  closureNote: string | null;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function validatePayload(value: unknown): IntentCorrectionPayload | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Invalid JSON body." };
  }

  const body = value as Record<string, unknown>;
  const conversationId = normalizeText(body.conversationId);
  const originalIntent = normalizeText(body.originalIntent);
  const correctedIntent = normalizeText(body.correctedIntent);

  if (!conversationId || !originalIntent || !correctedIntent) {
    return { error: "conversationId, originalIntent, and correctedIntent are required." };
  }

  if (body.closureNote != null && typeof body.closureNote !== "string") {
    return { error: "closureNote must be text." };
  }

  return {
    conversationId,
    originalIntent,
    correctedIntent,
    closureNote: normalizeText(body.closureNote),
  };
}

function normalizeKeywords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((keyword): keyword is string => typeof keyword === "string")
      .map((keyword) => keyword.trim())
      .filter(Boolean)
  ));
}

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "intent-corrections" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: IntentCorrectionPayload | { error: string };
  try {
    payload = validatePayload(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if ("error" in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const { conversationId, originalIntent, correctedIntent, closureNote } = payload;
  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.error("[intent-corrections] admin client unavailable:", adminState.reason);
    return NextResponse.json(
      { error: "Intent correction logging is temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
  const admin = adminState.client;

  // Verify the conversation belongs to this org
  const { data: conv, error: convError } = await admin
    .from("conversations")
    .select("id, subject, org_id")
    .eq("id", conversationId)
    .eq("org_id", appUser.org_id)
    .maybeSingle();

  if (convError) {
    console.error("[intent-corrections] conversation lookup failed:", convError.message);
    return NextResponse.json({ error: "Unable to verify this conversation." }, { status: 500 });
  }

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Get the first customer message body for AI analysis
  const { data: firstMsg, error: firstMsgError } = await admin
    .from("messages")
    .select("body_text")
    .eq("conversation_id", conversationId)
    .eq("sender_type", "customer")
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstMsgError) {
    console.error("[intent-corrections] first message lookup failed:", firstMsgError.message);
    return NextResponse.json({ error: "Unable to prepare correction context." }, { status: 500 });
  }

  const bodyPreview = (firstMsg?.body_text ?? "").slice(0, 500);

  // Insert the correction record
  const { data: correction, error: insertErr } = await admin
    .from("intent_corrections")
    .insert({
      org_id: appUser.org_id,
      conversation_id: conversationId,
      original_intent: originalIntent,
      corrected_intent: correctedIntent,
      closure_note: closureNote,
      subject: conv.subject || null,
      body_preview: bodyPreview || null,
      resolved_by: appUser.id,
      status: "pending_review",
    })
    .select("id, was_changed")
    .single();

  if (insertErr || !correction) {
    console.error("[intent-corrections] insert failed:", insertErr?.message ?? "No correction returned");
    return NextResponse.json({ error: "Unable to save the intent correction." }, { status: 500 });
  }

  // If the intent was actually changed, fire async AI keyword suggestion
  if (correction && correction.was_changed === true) {
    // Get existing keywords for the corrected intent (case-insensitive, take first match)
    const { data: intentRows } = await admin
      .from("intents")
      .select("keywords")
      .eq("org_id", appUser.org_id)
      .ilike("name", correctedIntent)
      .limit(1);
    const intentRow = intentRows?.[0] ?? null;

    const existingKeywords = normalizeKeywords(intentRow?.keywords);

    // Keep this Vercel-safe: after() allows the response to return while
    // ensuring the keyword suggestion write is still allowed to finish.
    after(async () => {
      try {
        const suggested = await suggestKeywordsFromCorrection({
          correctedIntent,
          subject: conv.subject ?? "",
          bodyPreview,
          closureNote: closureNote ?? "",
          existingKeywords,
        });

        if (suggested.length > 0) {
          await admin
            .from("intent_corrections")
            .update({ suggested_keywords: suggested })
            .eq("id", correction.id)
            .eq("org_id", appUser.org_id);
        }
      } catch (err) {
        console.error("[intent-corrections] Keyword suggestion failed:", err instanceof Error ? err.message : err);
      }
    });
  }

  return NextResponse.json({ ok: true, correctionId: correction.id });
}

export async function GET() {
  const appUser = await getCurrentAppUser({ label: "intent-corrections" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "admin", "qa_reviewer"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.error("[intent-corrections] admin client unavailable:", adminState.reason);
    return NextResponse.json(
      { error: "Intent correction insights are temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
  const admin = adminState.client;

  // Fetch recent corrections (last 90 days)
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const { data: corrections, error } = await admin
    .from("intent_corrections")
    .select("id, original_intent, corrected_intent, was_changed, closure_note, suggested_keywords, status, created_at, conversation_id")
    .eq("org_id", appUser.org_id)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[intent-corrections] corrections lookup failed:", error.message);
    return NextResponse.json({ error: "Unable to load intent corrections." }, { status: 500 });
  }

  // Build pattern summary: count how many times X was corrected to Y
  const patterns: Record<string, { originalIntent: string; correctedIntent: string; count: number }> = {};
  const correctionList = Array.isArray(corrections) ? corrections : [];
  for (const c of correctionList) {
    if (!c.was_changed) continue;
    const key = `${c.original_intent}→${c.corrected_intent}`;
    if (!patterns[key]) {
      patterns[key] = { originalIntent: c.original_intent, correctedIntent: c.corrected_intent, count: 0 };
    }
    patterns[key].count++;
  }

  const topPatterns = Object.values(patterns)
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return NextResponse.json({
    corrections: correctionList,
    patterns: topPatterns,
  });
}
