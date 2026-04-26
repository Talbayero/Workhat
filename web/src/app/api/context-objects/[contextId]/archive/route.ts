import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { archiveContextObject } from "@/lib/context/context-objects";

type RouteContext = {
  params: Promise<{ contextId: string }>;
};

export async function POST(_req: Request, ctx: RouteContext) {
  const { contextId } = await ctx.params;
  const appUser = await getCurrentAppUser({ label: "context-objects/:id/archive", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireCapability(appUser, "context.publish", "context-objects/:id/archive");
  if (denied) return denied;

  try {
    await archiveContextObject({
      orgId: appUser.org_id,
      contextId,
      actorId: appUser.id,
      actorRole: appUser.role,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to archive context object.";
    const status = message.includes("not found") ? 404 : 400;
    console.error("[context-objects/:id/archive] failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
