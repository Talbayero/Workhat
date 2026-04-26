import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { getContextObjectDetail, updateContextObject } from "@/lib/context/context-objects";
import { normalizeContextDefinition } from "@/lib/context/types";

type RouteContext = {
  params: Promise<{ contextId: string }>;
};

function parseBody(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const body = raw as Record<string, unknown>;
  return {
    title: typeof body.title === "string" ? body.title : "",
    description: typeof body.description === "string" ? body.description : "",
    category: typeof body.category === "string" ? body.category : "general",
    companyId: typeof body.companyId === "string" ? body.companyId : null,
    ownerUserId: typeof body.ownerUserId === "string" ? body.ownerUserId : null,
    reviewerUserId: typeof body.reviewerUserId === "string" ? body.reviewerUserId : null,
    contextDefinition: normalizeContextDefinition(body.contextDefinition),
  };
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { contextId } = await ctx.params;
  const appUser = await getCurrentAppUser({ label: "context-objects/:id", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireCapability(appUser, "context.read", "context-objects/:id");
  if (denied) return denied;

  const supabase = await createClient();
  try {
    const contextObject = await getContextObjectDetail({
      supabase,
      orgId: appUser.org_id,
      contextId,
    });

    if (!contextObject) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ contextObject });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load context object.";
    console.error("[context-objects/:id] load failed:", message);
    return NextResponse.json({ error: "Unable to load context object." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { contextId } = await ctx.params;
  const appUser = await getCurrentAppUser({ label: "context-objects/:id", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireCapability(appUser, "context.edit", "context-objects/:id");
  if (denied) return denied;

  let body: ReturnType<typeof parseBody> | null;
  try {
    body = parseBody(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const versionId = await updateContextObject({
      orgId: appUser.org_id,
      contextId,
      actorId: appUser.id,
      actorRole: appUser.role,
      input: body,
    });

    return NextResponse.json({ ok: true, versionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update context object.";
    const status = message.includes("not found for this workspace") || message.includes("required")
      ? 400
      : message.includes("Context object not found") ? 404 : 500;
    console.error("[context-objects/:id] update failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
