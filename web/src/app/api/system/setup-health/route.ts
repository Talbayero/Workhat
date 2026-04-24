import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { getEmailSetupReadiness } from "@/lib/email-connector/setup-readiness";

export async function GET() {
  const appUser = await getCurrentAppUser({ label: "system/setup-health" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireCapability(appUser, "settings.manage", "system/setup-health");
  if (denied) return denied;

  return NextResponse.json(getEmailSetupReadiness());
}
