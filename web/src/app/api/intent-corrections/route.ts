import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  let body: {
    conversationId?: string;
    originalIntent?: string;
    correctedIntent?: string;
    closureNote?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { conversationId, originalIntent, correctedIntent, closureNote } = body;

  if (!conversationId || !originalIntent || !correctedIntent) {
    return NextResponse.json(
      { error: "conversationId, originalIntent, and correctedIntent are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify the conversation belongs to this org
  const { data: conv } = await admin
    .from("conversations")
    .select("id, subject, org_id")
    .eq("id", conversationId)
    .eq("org_id", appUser.org_id)
    .single();

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Get the first customer message body for AI analysis
  const { data: firstMsg } = await admin
    .from("messages")
    .select("body_text")
    .eq("conversation_id", conversationId)
    .eq("sender_type", "customer")
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const bodyPreview = (firstMsg?.body_text ?? "").slice(0, 500);

  // Insert the correction record
  const { data: correction, error: insertErr } = await admin
    .from("intent_corrections")
    .insert({
      org_id: appUser.org_id,
      conversation_id: conversationId,
      original_intent: originalIntent.trim(),
      corrected_intent: correctedIntent.trim(),
      closure_note: closureNote?.trim() || null,
      subject: conv.subject || null,
      body_preview: bodyPreview || null,
      resolved_by: appUser.id,
      status: "pending_review",
    })
    .select("id, was_changed")
    .single();

  if (insertErr) {
    console.error("[intent-corrections] Insert error:", insertErr.message);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // If the intent was actually changed, fire async AI keyword suggestion
  if (correction && correction.was_changed === true) {
    // Get existing keywords for the corrected intent (case-insensitive, take first match)
    const { data: intentRows } = await admin
      .from("intents")
      .select("keywords")
      .eq("org_id", appUser.org_id)
      .ilike("name", correctedIntent.trim())
      .limit(1);
    const intentRow = intentRows?.[0] ?? null;

    const existingKeywords = (intentRow?.keywords as string[]) ?? [];

    // Run suggestion async — don't block the response
    void (async () => {
      try {
        const suggested = await suggestKeywordsFromCorrection({
          correctedIntent: correctedIntent.trim(),
          subject: conv.subject ?? "",
          bodyPreview,
          closureNote: closureNote?.trim() ?? "",
          existingKeywords,
        });

        if (suggested.length > 0) {
          await admin
            .from("intent_corrections")
            .update({ suggested_keywords: suggested })
            .eq("id", correction.id);
        }
      } catch (err) {
        console.error("[intent-corrections] Keyword suggestion failed:", err instanceof Error ? err.message : err);
      }
    })();
  }

  return NextResponse.json({ ok: true, correctionId: correction.id });
}

export async function GET() {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "admin", "qa_reviewer"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
