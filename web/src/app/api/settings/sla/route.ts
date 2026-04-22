import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/security/audit-logger";

const MINUTES_MAX = 10_080;
const AT_RISK_MAX = 1_440;

function parseMinuteValue(value: unknown, max: number) {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(num) || num < 1 || num > max) return null;
  return num;
}

export async function GET() {
  const caller = await getCurrentAppUser({ label: "settings/sla", select: "id, org_id, role" });
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_sla_policies")
    .select("enabled, first_response_minutes, next_response_minutes, at_risk_threshold_minutes, business_hours_json")
    .eq("org_id", caller.org_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to load SLA policy." }, { status: 500 });
  }

  return NextResponse.json({
    policy: data ?? {
      enabled: true,
      first_response_minutes: 60,
      next_response_minutes: 240,
      at_risk_threshold_minutes: 15,
      business_hours_json: { mode: "calendar" },
    },
  });
}

export async function PATCH(req: NextRequest) {
  const caller = await getCurrentAppUser({ label: "settings/sla", select: "id, org_id, role" });
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireCapability(caller, "settings.manage", "settings/sla");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const firstResponse = parseMinuteValue(body.first_response_minutes, MINUTES_MAX);
  const nextResponse = parseMinuteValue(body.next_response_minutes, MINUTES_MAX);
  const atRisk = parseMinuteValue(body.at_risk_threshold_minutes, AT_RISK_MAX);

  if (firstResponse === null || nextResponse === null || atRisk === null) {
    return NextResponse.json({ error: "SLA values must be whole minutes in the allowed range." }, { status: 422 });
  }

  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
  const supabase = await createClient();
  const nextPolicy = {
    org_id: caller.org_id,
    enabled,
    first_response_minutes: firstResponse,
    next_response_minutes: nextResponse,
    at_risk_threshold_minutes: atRisk,
    business_hours_json: { mode: "calendar" },
    updated_by: caller.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("org_sla_policies")
    .upsert(nextPolicy, { onConflict: "org_id" });

  if (error) {
    return NextResponse.json({ error: "Unable to save SLA policy." }, { status: 500 });
  }

  await logAudit({
    action: "org.settings_updated",
    orgId: caller.org_id,
    actorId: caller.id,
    actorRole: caller.role,
    resourceType: "org_sla_policy",
    resourceId: caller.org_id,
    newValues: nextPolicy,
    req,
  });

  return NextResponse.json({ ok: true, policy: nextPolicy });
}
