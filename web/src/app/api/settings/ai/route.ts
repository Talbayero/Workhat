import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireAnyCapability } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import {
  getSafeOrgAISettings,
  mapAISettingsError,
  revokeOrgAIProviderCredential,
  saveOrgAISettings,
} from "@/lib/ai-settings";
import { logAudit } from "@/lib/security/audit-logger";

export async function GET() {
  const caller = await getCurrentAppUser({ label: "settings/ai", select: "id, org_id, role" });
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireAnyCapability(caller, ["ai.configure", "settings.manage"], "settings/ai");
  if (denied) return denied;

  const supabase = await createClient();
  try {
    const settings = await getSafeOrgAISettings(supabase, caller.org_id);
    return NextResponse.json({ settings });
  } catch (error) {
    const mapped = mapAISettingsError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function PATCH(req: NextRequest) {
  const caller = await getCurrentAppUser({ label: "settings/ai", select: "id, org_id, role" });
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireAnyCapability(caller, ["ai.configure", "settings.manage"], "settings/ai", req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    const settings = await saveOrgAISettings({
      db: supabase,
      orgId: caller.org_id,
      userId: caller.id,
      aiMode: body.aiMode,
      defaultProvider: body.defaultProvider,
      defaultModel: body.defaultModel,
      apiKey: body.apiKey,
    });

    await logAudit({
      action: "org.settings_updated",
      orgId: caller.org_id,
      actorId: caller.id,
      actorRole: caller.role,
      resourceType: "org_ai_settings",
      resourceId: caller.org_id,
      newValues: {
        aiMode: settings.aiMode,
        defaultProvider: settings.defaultProvider,
        defaultModel: settings.defaultModel,
        status: settings.status,
        credentialKeyHint: settings.credential?.keyHint ?? null,
      },
      req,
    });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const mapped = mapAISettingsError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await getCurrentAppUser({ label: "settings/ai", select: "id, org_id, role" });
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireAnyCapability(caller, ["ai.configure", "settings.manage"], "settings/ai", req);
  if (denied) return denied;

  const supabase = await createClient();
  try {
    const settings = await revokeOrgAIProviderCredential({
      db: supabase,
      orgId: caller.org_id,
      userId: caller.id,
    });

    await logAudit({
      action: "org.settings_updated",
      orgId: caller.org_id,
      actorId: caller.id,
      actorRole: caller.role,
      resourceType: "org_ai_provider_credentials",
      resourceId: caller.org_id,
      req,
    });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const mapped = mapAISettingsError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
