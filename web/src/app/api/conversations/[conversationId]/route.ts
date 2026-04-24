import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/security/audit-logger";
import { refreshConversationSla } from "@/lib/sla/refresh";
import { notifyConversationAssignmentChanged } from "@/lib/notifications/conversation-notifications";
import { emitWorkflowEvent } from "@/lib/workflow-engine";

/* PATCH /api/conversations/:id — update status, priority, assignee, tags */

const VALID_STATUSES = new Set(["open", "waiting_on_customer", "waiting_on_internal", "closed"]);
const VALID_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const MAX_ASSIGNED_NAME_LENGTH = 100;
const MAX_INTENT_LENGTH = 80;
const MAX_TAG_COUNT = 20;
const MAX_TAG_LENGTH = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const denied = await requireCapability(appUser, "conversations.assign", "conversations/:id");
  if (denied) return denied;

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

  const supabase = await createClient();
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
    if (!("assigned_user_id" in body)) {
      updates.assigned_user_id = null;
    }
  }

  if ("assigned_user_id" in body) {
    if (typeof body.assigned_user_id !== "string" && body.assigned_user_id != null) {
      return NextResponse.json({ error: "Assigned user id must be text." }, { status: 400 });
    }

    const rawUserId = typeof body.assigned_user_id === "string" ? body.assigned_user_id.trim() : "";
    if (!rawUserId) {
      updates.assigned_user_id = null;
    } else {
      if (!UUID_RE.test(rawUserId)) {
        return NextResponse.json({ error: "Assigned user id is invalid." }, { status: 422 });
      }

      const { data: assignee, error: assigneeError } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("id", rawUserId)
        .eq("org_id", appUser.org_id)
        .maybeSingle();

      if (assigneeError) {
        console.error("[conversations/:id] assignee lookup failed:", assigneeError.message);
        return NextResponse.json({ error: "Unable to verify the assignee." }, { status: 500 });
      }

      if (!assignee) {
        return NextResponse.json({ error: "Assigned user not found for this workspace." }, { status: 404 });
      }

      updates.assigned_user_id = rawUserId;
      updates.assigned_to_name = (assignee as { full_name?: string | null }).full_name?.trim() || "";
    }
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

  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id, status, priority, assigned_user_id, assigned_to_name, risk_level, tags, intent")
    .eq("id", conversationId)
    .eq("org_id", appUser.org_id)
    .maybeSingle();

  if (existingError) {
    console.error("[conversations/:id] conversation lookup failed:", existingError.message);
    return NextResponse.json({ error: "Unable to verify this conversation." }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: "Conversation not found for this workspace." }, { status: 404 });

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

  after(async () => {
    const adminState = createOptionalAdminClient();
    if (adminState.client) {
      await refreshConversationSla({
        db: adminState.client,
        orgId: appUser.org_id,
        conversationId,
        source: "api.conversations.update",
      });

      await notifyConversationAssignmentChanged({
        db: adminState.client,
        orgId: appUser.org_id,
        conversationId,
        previousAssignedUserId: (existing as { assigned_user_id?: string | null }).assigned_user_id ?? null,
        previousAssignedToName: (existing as { assigned_to_name?: string | null }).assigned_to_name ?? null,
        nextAssignedUserId: "assigned_user_id" in updates
          ? (updates.assigned_user_id as string | null | undefined) ?? null
          : ((existing as { assigned_user_id?: string | null }).assigned_user_id ?? null),
        nextAssignedToName: "assigned_to_name" in updates
          ? (updates.assigned_to_name as string | null | undefined) ?? null
          : ((existing as { assigned_to_name?: string | null }).assigned_to_name ?? null),
        assignedByUserId: appUser.id,
        fallbackAssignedByName: appUser.full_name ?? null,
        requestOrigin: req.nextUrl.origin,
      });
    }

    await emitWorkflowEvent({
      orgId: appUser.org_id,
      eventType: "conversation.updated",
      aggregateType: "conversation",
      aggregateId: conversationId,
      conversationId,
      actorId: appUser.id,
      source: "api.conversations.update",
      payload: {
        oldValues: JSON.parse(JSON.stringify(existing)),
        newValues: JSON.parse(JSON.stringify(updates)),
      },
    });
  });

  return NextResponse.json({ ok: true });
}
