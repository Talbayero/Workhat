import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { runGmailMvpSmokeCheck } from "@/lib/email/mvp-smoke-check";
import { extractContextFromRequest } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const requestId = extractContextFromRequest(req).requestId;
  const appUser = await getCurrentAppUser({ label: "system/mvp-smoke-check", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized", requestId }, { status: 401 });

  const denied = await requireCapability(appUser, "settings.manage", "system/mvp-smoke-check", req);
  if (denied) return denied;

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin database client unavailable.";
    console.error("[mvp/smoke-check] admin client init failed:", {
      requestId,
      orgId: appUser.org_id,
      message,
    });
    return NextResponse.json({
      error: "MVP smoke check is unavailable because the admin database key is not configured.",
      requestId,
    }, { status: 503 });
  }

  try {
    const result = await runGmailMvpSmokeCheck({
      db,
      orgId: appUser.org_id,
      requestId,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MVP smoke check failed.";
    console.error("[mvp/smoke-check] failed:", {
      requestId,
      orgId: appUser.org_id,
      message,
    });
    return NextResponse.json({
      error: "MVP smoke check failed. Review server logs with the returned request id.",
      requestId,
    }, { status: 500 });
  }
}
