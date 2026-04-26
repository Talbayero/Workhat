import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createContextObject, listContextObjectsForOrg } from "@/lib/context/context-objects";
import { normalizeContextDefinition } from "@/lib/context/types";

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

export async function GET(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "context-objects", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireCapability(appUser, "context.read", "context-objects");
  if (denied) return denied;

  const statusParam = req.nextUrl.searchParams.get("status");
  const status = statusParam === "draft" || statusParam === "active" || statusParam === "archived"
    ? statusParam
    : "all";

  const supabase = await createClient();
  try {
    const contexts = await listContextObjectsForOrg({
      supabase,
      orgId: appUser.org_id,
      status,
    });

    return NextResponse.json({ contexts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load context objects.";
    console.error("[context-objects] list failed:", message);
    return NextResponse.json({ error: "Unable to load context objects." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "context-objects", select: "id, org_id, role" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireCapability(appUser, "context.edit", "context-objects");
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
    const contextId = await createContextObject({
      orgId: appUser.org_id,
      actorId: appUser.id,
      actorRole: appUser.role,
      input: body,
    });

    return NextResponse.json({ contextId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create context object.";
    const status = message.includes("not found for this workspace") || message.includes("required")
      ? 400
      : 500;
    console.error("[context-objects] create failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
