/**
 * GET /api/audit-logs
 *
 * Returns the org's audit log for admin/manager review.
 *
 * Query params:
 *   limit    — max records to return (default 100, max 500)
 *   offset   — pagination offset (default 0)
 *   action   — filter by action type (optional)
 *   actor_id — filter by actor (optional)
 *
 * SOC 2 evidence: supports CC4.1 (ongoing monitoring) and CC7.2 (anomaly detection).
 * Admins and managers can view; agents and qa_reviewers cannot.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createOptionalAdminClient } from "@/lib/supabase/admin";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

export async function GET(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "audit-logs" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireCapability(appUser, "audit.read", "audit-logs");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
  const action = searchParams.get("action") ?? null;
  const actorId = searchParams.get("actor_id") ?? null;

  // Use admin client to bypass RLS on audit_logs (the RLS read policy would work
  // too, but the admin client is consistent with other admin-only reads).
  const { client, reason } = createOptionalAdminClient();
  if (!client) {
    console.error("[audit-logs] admin client unavailable:", reason);
    return NextResponse.json({ error: "Audit log is temporarily unavailable." }, { status: 503 });
  }

  let query = client
    .from("audit_logs")
    .select("id, action, actor_email, actor_role, resource_type, resource_id, resource_label, success, error_message, ip_address, created_at", { count: "exact" })
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) query = query.eq("action", action);
  if (actorId) query = query.eq("actor_id", actorId);

  const { data, count, error } = await query;

  if (error) {
    console.error("[audit-logs] query failed:", error.message);
    return NextResponse.json({ error: "Unable to fetch audit logs." }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [], total: count ?? 0, limit, offset });
}
