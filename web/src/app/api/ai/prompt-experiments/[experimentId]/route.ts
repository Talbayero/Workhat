import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireAnyCapability } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUSES = new Set(["draft", "running", "paused", "rolled_back", "completed"]);

type RouteContext = {
  params: Promise<{ experimentId: string }>;
};

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { experimentId } = await ctx.params;
  if (!experimentId?.trim()) {
    return NextResponse.json({ error: "experimentId is required." }, { status: 400 });
  }

  const caller = await getCurrentAppUser({ label: "ai/prompt-experiments/:id", select: "id, org_id, role" });
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireAnyCapability(caller, ["ai.configure", "settings.manage"], "ai/prompt-experiments/:id");
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

  const status = typeof body.status === "string" ? body.status : null;
  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid experiment status." }, { status: 422 });
  }

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "running") {
    updates.started_at = new Date().toISOString();
    updates.ended_at = null;
  }

  if (status === "rolled_back" || status === "completed") {
    updates.ended_at = new Date().toISOString();
  }

  if (typeof body.rollback_version_key === "string" && body.rollback_version_key.trim()) {
    updates.rollback_version_key = body.rollback_version_key.trim().slice(0, 80);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_prompt_experiments")
    .update(updates)
    .eq("id", experimentId)
    .eq("org_id", caller.org_id)
    .select("id, name, status, stable_version_key, rollback_version_key")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to update prompt experiment." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Prompt experiment not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, experiment: data });
}
