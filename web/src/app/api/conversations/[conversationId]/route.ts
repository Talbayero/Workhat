import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/security/audit-logger";

/* PATCH /api/conversations/:id — update status, priority, assignee, tags */

const VALID_STATUSES = new Set(["open", "waiting_on_customer", "waiting_on_internal", "in_progress", "resolved", "archived"]);
const VALID_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const MAX_ASSIGNED_NAME_LENGTH = 100;
const MAX_INTENT_LENGTH = 80;
const MAX_TAG_COUNT = 20;
const MAX_TAG_LENGTH = 50;

type RouteContext = { params: Promise<{ conversationId: string }> };

function normalizeTags(value: unknown) {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    return null;
  }

  const tags = [...new Set(value.map((tag) => (tag as string).trim()).filter(Boolean))];
  // Enforce per-tag and total-count limits
  if (tags.length > MAX_TAG_COUNT) return null;
  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) return null;
  return tags;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { conversationId } = await ctx.params;
  if (!conversationId?.trim()) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }

  const appUser = await getCurrentAppUser({ label: "conversations/:id" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ("status" in body) {
    if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status value." }, { status: 422 });
    }
    updates.status = body.status;
  }

  if ("priority" in body) {
    if (typeof body.priority !== "string" || !VALID_PRIORITIES.has(body.priority)) {
      return NextResponse.json({ error: "Invalid priority value." }, { status: 422 });
    }
    updates.priority = body.priority;
  }

  if ("assigned_to_name" in body) {
    if (typeof body.assigned_to_name !== "string" && body.assigned_to_name != null) {
      return NextResponse.json({ error: "Assigned user name must be text." }, { status: 400 });
    }
    const name = typeof body.assigned_to_name === "string" ? body.assigned_to_name.trim() : "";
    if (name.length > MAX_ASSIGNED_NAME_LENGTH) {
      return NextResponse.json({ error: "Assigned user name is too long." }, { status: 422 });
    }
    updates.assigned_to_name = name;
  }

  if ("tags" in body) {
    const tags = normalizeTags(body.tags);
    if (tags === null) {
      return NextResponse.json(
        { error: `Tags must be a list of text values (max ${MAX_TAG_COUNT} tags, each max ${MAX_TAG_LENGTH} characters).` },
        { status: 400 }
      );
    }
    updates.tags = tags;
  }

  if ("intent" in body) {
    if (typeof body.intent !== "string" && body.intent != null) {
      return NextResponse.json({ error: "Intent must be text." }, { status: 400 });
    }
    const intent = typeof body.intent === "string" ? body.intent.trim().toLowerCase() : "";
    if (intent.length > MAX_INTENT_LENGTH) {
      return NextResponse.json({ error: "Intent value is too long." }, { status: 422 });
    }
    updates.intent = intent || "unclassified";
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .update(updates)
    .eq("id", conversationId)
    .eq("org_id", appUser.org_id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[conversations/:id] conversation update failed:", error.message);
    return NextResponse.json({ error: "Unable to update this conversation." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Conversation not found for this workspace." }, { status: 404 });

  await logAudit({
    action: "conversation.updated",
    orgId: appUser.org_id,
    actorId: appUser.id,
    actorRole: appUser.role,
    resourceType: "conversation",
    resourceId: conversationId,
    newValues: updates,
  });

  return NextResponse.json({ ok: true });
}
