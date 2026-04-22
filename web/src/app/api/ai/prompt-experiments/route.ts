import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireAnyCapability } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const caller = await getCurrentAppUser({ label: "ai/prompt-experiments", select: "id, org_id, role" });
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireAnyCapability(caller, ["ai.configure", "settings.manage"], "ai/prompt-experiments");
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_prompt_experiments")
    .select(`
      id, name, status, stable_version_key, rollback_version_key, started_at, ended_at, created_at,
      ai_prompt_experiment_variants(id, prompt_version_key, allocation_percent, is_control, config_json)
    `)
    .eq("org_id", caller.org_id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Unable to load prompt experiments." }, { status: 500 });
  }

  return NextResponse.json({ experiments: data ?? [] });
}
