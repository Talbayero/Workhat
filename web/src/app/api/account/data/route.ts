/**
 * GET  /api/account/data  — export all org data (DSAR data access request)
 * DELETE /api/account/data — submit an erasure request (DSAR deletion)
 *
 * Both operations require admin role and are logged to the audit trail.
 *
 * SOC 2 / Privacy coverage:
 *   - Privacy P5.1: data subjects have the right to access their personal data
 *   - Privacy P4.1: data must be deleted on request (right to erasure / GDPR Art. 17)
 *   - SOC 2 C1.2: disposal of confidential information must be documented
 *
 * Design notes:
 *   - GET returns a structured JSON export of the org's data. For production,
 *     this should be replaced with a background job that emails a download link.
 *   - DELETE creates a data_deletion_requests record for manual admin review.
 *     Full automated deletion is gated on a manual compliance review to prevent
 *     accidental data loss (best practice for GDPR Art. 17 erasure workflows).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/security/audit-logger";

const MAX_NOTES_LENGTH = 2000;

// ── GET — data export ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "account/data", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireCapability(appUser, "settings.manage", "account/data");
  if (denied) return denied;

  const supabase = await createClient();

  // Collect all org data categories
  const [users, contacts, companies, conversations, knowledge] = await Promise.all([
    supabase.from("users").select("id, full_name, email, role, status, created_at").eq("org_id", appUser.org_id),
    supabase.from("contacts").select("id, first_name, last_name, email, phone, location, tags, status, tier, created_at").eq("org_id", appUser.org_id),
    supabase.from("companies").select("id, name, domain, industry, tags, created_at").eq("org_id", appUser.org_id),
    supabase.from("conversations").select("id, subject, status, channel_id, created_at, updated_at").eq("org_id", appUser.org_id),
    supabase.from("knowledge_entries").select("id, title, category, summary, tags, is_active, created_at").eq("org_id", appUser.org_id),
  ]);

  await logAudit({
    action: "data.export_requested",
    orgId: appUser.org_id,
    actorId: appUser.id,
    actorRole: appUser.role,
    resourceType: "organization",
    resourceId: appUser.org_id,
    req,
  });

  return NextResponse.json({
    exported_at: new Date().toISOString(),
    org_id: appUser.org_id,
    data: {
      users:         users.data         ?? [],
      contacts:      contacts.data      ?? [],
      companies:     companies.data     ?? [],
      conversations: conversations.data ?? [],
      knowledge:     knowledge.data     ?? [],
    },
  });
}

// ── DELETE — erasure request ──────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "account/data", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireCapability(appUser, "settings.manage", "account/data");
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // body is optional — proceed with empty
  }

  const requesterEmail = typeof body.requester_email === "string" ? body.requester_email.trim().slice(0, 254) : null;
  const subjectEmail   = typeof body.subject_email   === "string" ? body.subject_email.trim().slice(0, 254)   : null;
  const notes          = typeof body.notes           === "string" ? body.notes.trim().slice(0, MAX_NOTES_LENGTH) : null;

  if (!requesterEmail || !subjectEmail) {
    return NextResponse.json({ error: "requester_email and subject_email are required." }, { status: 400 });
  }

  const { client, reason } = createOptionalAdminClient();
  if (!client) {
    console.error("[account/data] admin client unavailable:", reason);
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  const { data: request, error } = await client
    .from("data_deletion_requests")
    .insert({
      org_id:           appUser.org_id,
      request_type:     "erasure",
      requester_email:  requesterEmail,
      subject_email:    subjectEmail,
      notes,
      status:           "pending",
    })
    .select("id, due_by")
    .single();

  if (error || !request) {
    console.error("[account/data] deletion request insert failed:", error?.message);
    return NextResponse.json({ error: "Unable to submit deletion request." }, { status: 500 });
  }

  await logAudit({
    action: "data.deletion_requested",
    orgId: appUser.org_id,
    actorId: appUser.id,
    actorRole: appUser.role,
    resourceType: "data_deletion_request",
    resourceId: request.id,
    newValues: { requester_email: requesterEmail, subject_email: subjectEmail },
    req,
  });

  return NextResponse.json({
    ok: true,
    request_id: request.id,
    due_by: request.due_by,
    message: "Your deletion request has been logged. Our team will process it within 30 days in accordance with applicable data protection law.",
  }, { status: 202 });
}
