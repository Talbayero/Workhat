import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireAnyCapability } from "@/lib/auth/capabilities";
import { AISettingsError, mapAISettingsError, validateOpenAIKey } from "@/lib/ai-settings";
import { isSupportedOpenAIModel } from "@/lib/ai-settings";

export async function POST(req: NextRequest) {
  const caller = await getCurrentAppUser({ label: "settings/ai/test", select: "id, org_id, role" });
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireAnyCapability(caller, ["ai.configure", "settings.manage"], "settings/ai/test", req);
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

  if (body.provider !== "openai") {
    const mapped = mapAISettingsError(
      new AISettingsError("ai_model_unavailable", "OpenAI is the only supported AI provider in Work Hat V1.", 422)
    );
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  const model = typeof body.model === "string" && isSupportedOpenAIModel(body.model) ? body.model : null;
  if (!model) {
    const mapped = mapAISettingsError(
      new AISettingsError("ai_model_unavailable", "Choose a supported OpenAI model.", 422)
    );
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  try {
    await validateOpenAIKey({ apiKey, model });
    return NextResponse.json({ ok: true, provider: "openai", model });
  } catch (error) {
    const mapped = mapAISettingsError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
