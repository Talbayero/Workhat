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
import { getAuditTrail, parseAuditTrailFilters } from "@/lib/audit/audit-trail";

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

  try {
    const result = await getAuditTrail(appUser, parseAuditTrailFilters({
      actor: searchParams.get("actor") ?? searchParams.get("actor_id"),
      action: searchParams.get("action"),
      entityType: searchParams.get("entityType") ?? searchParams.get("resource_type"),
      entityId: searchParams.get("entityId") ?? searchParams.get("resource_id"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      offset,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
    }));

    return NextResponse.json({
      logs: result.logs,
      total: result.total,
      limit: result.pageSize,
      offset,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (error) {
    console.error("[audit-logs] query failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Unable to fetch audit logs." }, { status: 500 });
  }
}
