import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { hasCapability } from "@/lib/auth/capabilities";
import {
  getEmailSetupReadiness,
  publicEmailSetupReadiness,
} from "@/lib/email-connector/setup-readiness";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appUser = await getCurrentAppUser({ label: "email/setup/readiness", select: "id, org_id, role, full_name" });
  if (!appUser) {
    return NextResponse.json({
      loginEmail: user.email ?? null,
      hasWorkspace: false,
      readiness: publicEmailSetupReadiness(getEmailSetupReadiness(), false),
    });
  }

  const canViewSetupDetails = await hasCapability(appUser, "settings.manage", "email/setup/readiness");
  return NextResponse.json({
    loginEmail: user.email ?? null,
    hasWorkspace: true,
    canViewSetupDetails,
    readiness: publicEmailSetupReadiness(getEmailSetupReadiness(), canViewSetupDetails),
  });
}
