import { NextRequest, NextResponse } from "next/server";
import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { refreshOrgSla } from "@/lib/sla/refresh";

export const runtime = "nodejs";

function isAuthorizedCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    return NextResponse.json(
      { error: "Admin database unavailable.", reason: adminState.reason },
      { status: 503 }
    );
  }

  const { data: policies, error } = await adminState.client
    .from("org_sla_policies")
    .select("org_id")
    .eq("enabled", true)
    .limit(500);

  if (error) {
    return NextResponse.json({ error: "Unable to load SLA policies." }, { status: 500 });
  }

  let refreshed = 0;
  let failed = 0;
  for (const policy of (policies ?? []) as { org_id: string }[]) {
    const result = await refreshOrgSla({
      db: adminState.client,
      orgId: policy.org_id,
      limit: 200,
    });
    refreshed += result.refreshed;
    failed += result.failed;
  }

  return NextResponse.json({
    ok: true,
    orgs: policies?.length ?? 0,
    refreshed,
    failed,
  });
}
