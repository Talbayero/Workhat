import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { publishContextObject } from "@/lib/context/context-objects";

type RouteContext = {
  params: Promise<{ contextId: string }>;
};

export async function POST(_req: Request, ctx: RouteContext) {
  const { contextId } = await ctx.params;
  const appUser = await getCurrentAppUser({ label: "context-objects/:id/publish", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireCapability(appUser, "context.publish", "context-objects/:id/publish");
  if (denied) return denied;

  try {
    await publishContextObject({
      orgId: appUser.org_id,
      contextId,
      actorId: appUser.id,
      actorRole: appUser.role,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to publish context object.";
    const status = message.includes("not found") ? 404 : 400;
    console.error("[context-objects/:id/publish] failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
