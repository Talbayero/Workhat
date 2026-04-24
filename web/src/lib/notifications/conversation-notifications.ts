import "server-only";

import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";
import type { AdminDb } from "@/lib/workflow-engine/types";
import {
  buildConversationAssignedSubject,
  buildQaFollowUpSubject,
  renderConversationAssignedEmail,
  renderQaFollowUpEmail,
} from "@/lib/notifications/email-templates";

type NotificationRecipient = {
  userId: string | null;
  email: string;
  fullName: string | null;
};

type ConversationNotificationInput = {
  recipientEmail: string;
  recipientName?: string | null;
  companyName: string;
  contactName?: string | null;
  conversationSubject?: string | null;
  conversationUrl: string;
  assignedBy?: string | null;
};

type AssignmentChangeInput = {
  db: AdminDb;
  orgId: string;
  conversationId: string;
  previousAssignedUserId?: string | null;
  previousAssignedToName?: string | null;
  nextAssignedUserId?: string | null;
  nextAssignedToName?: string | null;
  assignedByUserId?: string | null;
  fallbackAssignedByName?: string | null;
  requestOrigin?: string | null;
};

type QaFollowUpNotificationInput = {
  db: AdminDb;
  orgId: string;
  conversationId: string;
  reviewerUserId: string;
  assignedByUserId?: string | null;
  fallbackAssignedByName?: string | null;
  requestOrigin?: string | null;
};

type ConversationNotificationContext = {
  companyName: string;
  contactName: string | null;
  conversationSubject: string | null;
};

function normalizeText(value: string | null | undefined, fallback = "Unknown") {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizeComparable(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getAppBaseUrl(requestOrigin?: string | null) {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/$/, "");

  if (requestOrigin) return requestOrigin.replace(/\/$/, "");

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  throw new Error("Work Hat app base URL is not configured for notification links.");
}

function buildConversationUrl(conversationId: string, requestOrigin?: string | null) {
  return `${getAppBaseUrl(requestOrigin)}/inbox/${conversationId}`;
}

async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[conversation-notifications] skipped: RESEND_API_KEY is not configured");
    return { ok: false as const, skipped: true as const, reason: "missing_resend_key" };
  }

  const response = await fetchWithCircuitBreaker("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Work Hat <notifications@work-hat.com>",
      to: [to],
      subject,
      html,
    }),
  }, { key: "resend-conversation-notifications", timeoutMs: 15_000 });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Notification provider rejected email (${response.status}): ${body.slice(0, 300)}`);
  }

  return { ok: true as const, skipped: false as const };
}

async function findUserById(db: AdminDb, orgId: string, userId: string): Promise<NotificationRecipient | null> {
  const { data, error } = await db
    .from("users")
    .select("id, email, full_name")
    .eq("org_id", orgId)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || !(data as { email?: string | null }).email) return null;

  return {
    userId: (data as { id: string }).id,
    email: (data as { email: string }).email,
    fullName: (data as { full_name?: string | null }).full_name ?? null,
  };
}

async function findUserByName(db: AdminDb, orgId: string, fullName: string): Promise<NotificationRecipient | null> {
  const normalized = fullName.trim();
  if (!normalized) return null;

  const { data, error } = await db
    .from("users")
    .select("id, email, full_name")
    .eq("org_id", orgId)
    .eq("full_name", normalized)
    .limit(2);

  if (error) throw new Error(error.message);
  if (!data || data.length !== 1) return null;

  const user = data[0] as { id: string; email?: string | null; full_name?: string | null };
  if (!user.email) return null;

  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name ?? null,
  };
}

async function resolveRecipient({
  db,
  orgId,
  assignedUserId,
  assignedToName,
}: {
  db: AdminDb;
  orgId: string;
  assignedUserId?: string | null;
  assignedToName?: string | null;
}) {
  if (assignedUserId) return findUserById(db, orgId, assignedUserId);
  if (assignedToName && normalizeComparable(assignedToName) === "you") return null;
  if (assignedToName) return findUserByName(db, orgId, assignedToName);
  return null;
}

async function resolveAssignedByName({
  db,
  orgId,
  assignedByUserId,
  fallbackAssignedByName,
}: {
  db: AdminDb;
  orgId: string;
  assignedByUserId?: string | null;
  fallbackAssignedByName?: string | null;
}) {
  if (assignedByUserId) {
    const sender = await findUserById(db, orgId, assignedByUserId);
    if (sender?.fullName) return sender.fullName;
  }
  return fallbackAssignedByName?.trim() || null;
}

async function loadConversationNotificationContext(db: AdminDb, orgId: string, conversationId: string): Promise<ConversationNotificationContext | null> {
  const { data, error } = await db
    .from("conversations")
    .select("id, subject, companies(name), contacts(full_name)")
    .eq("org_id", orgId)
    .eq("id", conversationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as {
    id: string;
    subject?: string | null;
    companies?: { name?: string | null } | { name?: string | null }[] | null;
    contacts?: { full_name?: string | null } | { full_name?: string | null }[] | null;
  };

  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;

  return {
    companyName: normalizeText(company?.name ?? null, "Unknown company"),
    contactName: normalizeOptionalText(contact?.full_name ?? null),
    conversationSubject: normalizeOptionalText(row.subject ?? null),
  };
}

export async function sendConversationAssignedNotification(input: ConversationNotificationInput) {
  const subject = buildConversationAssignedSubject(input.companyName, input.conversationSubject);
  console.info("[conversation-notifications] attempt: conversation assignment", {
    recipientEmail: input.recipientEmail,
    companyName: input.companyName,
    conversationSubject: input.conversationSubject ?? null,
  });

  return sendEmail({
    to: input.recipientEmail,
    subject,
    html: renderConversationAssignedEmail({
      recipientName: input.recipientName,
      companyName: input.companyName,
      contactName: input.contactName,
      conversationSubject: input.conversationSubject,
      conversationUrl: input.conversationUrl,
      assignedBy: input.assignedBy,
    }),
  });
}

export async function sendQaFollowUpNotification(input: ConversationNotificationInput) {
  const subject = buildQaFollowUpSubject(input.companyName, input.conversationSubject);
  console.info("[conversation-notifications] attempt: QA follow-up", {
    recipientEmail: input.recipientEmail,
    companyName: input.companyName,
    conversationSubject: input.conversationSubject ?? null,
  });

  return sendEmail({
    to: input.recipientEmail,
    subject,
    html: renderQaFollowUpEmail({
      recipientName: input.recipientName,
      companyName: input.companyName,
      contactName: input.contactName,
      conversationSubject: input.conversationSubject,
      conversationUrl: input.conversationUrl,
      assignedBy: input.assignedBy,
    }),
  });
}

export async function notifyConversationAssignmentChanged(input: AssignmentChangeInput) {
  const previousUser = input.previousAssignedUserId ?? null;
  const nextUser = input.nextAssignedUserId ?? null;
  const previousName = normalizeComparable(input.previousAssignedToName);
  const nextName = normalizeComparable(input.nextAssignedToName);

  if (previousUser === nextUser && previousName === nextName) {
    console.info("[conversation-notifications] skipped: conversation assignment unchanged", {
      conversationId: input.conversationId,
      orgId: input.orgId,
    });
    return;
  }

  const recipient = normalizeComparable(input.nextAssignedToName) === "you" && input.assignedByUserId
    ? await findUserById(input.db, input.orgId, input.assignedByUserId)
    : await resolveRecipient({
        db: input.db,
        orgId: input.orgId,
        assignedUserId: input.nextAssignedUserId,
        assignedToName: input.nextAssignedToName,
      });

  if (!recipient) {
    console.info("[conversation-notifications] skipped: conversation assignee recipient not resolvable", {
      conversationId: input.conversationId,
      orgId: input.orgId,
      nextAssignedUserId: input.nextAssignedUserId ?? null,
      nextAssignedToName: input.nextAssignedToName ?? "",
    });
    return;
  }

  const conversation = await loadConversationNotificationContext(input.db, input.orgId, input.conversationId);
  if (!conversation) {
    console.warn("[conversation-notifications] skipped: conversation context not found", {
      conversationId: input.conversationId,
      orgId: input.orgId,
    });
    return;
  }

  const assignedBy = await resolveAssignedByName({
    db: input.db,
    orgId: input.orgId,
    assignedByUserId: input.assignedByUserId,
    fallbackAssignedByName: input.fallbackAssignedByName,
  });

  try {
    await sendConversationAssignedNotification({
      recipientEmail: recipient.email,
      recipientName: recipient.fullName,
      companyName: conversation.companyName,
      contactName: conversation.contactName,
      conversationSubject: conversation.conversationSubject,
      conversationUrl: buildConversationUrl(input.conversationId, input.requestOrigin),
      assignedBy,
    });
  } catch (error) {
    console.error("[conversation-notifications] failed: conversation assignment", {
      conversationId: input.conversationId,
      orgId: input.orgId,
      recipientEmail: recipient.email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function notifyQaFollowUpAssigned(input: QaFollowUpNotificationInput) {
  const recipient = await findUserById(input.db, input.orgId, input.reviewerUserId);
  if (!recipient) {
    console.info("[conversation-notifications] skipped: QA follow-up recipient not resolvable", {
      conversationId: input.conversationId,
      orgId: input.orgId,
      reviewerUserId: input.reviewerUserId,
    });
    return;
  }

  const conversation = await loadConversationNotificationContext(input.db, input.orgId, input.conversationId);
  if (!conversation) {
    console.warn("[conversation-notifications] skipped: QA follow-up conversation context not found", {
      conversationId: input.conversationId,
      orgId: input.orgId,
    });
    return;
  }

  const assignedBy = await resolveAssignedByName({
    db: input.db,
    orgId: input.orgId,
    assignedByUserId: input.assignedByUserId,
    fallbackAssignedByName: input.fallbackAssignedByName,
  });

  try {
    await sendQaFollowUpNotification({
      recipientEmail: recipient.email,
      recipientName: recipient.fullName,
      companyName: conversation.companyName,
      contactName: conversation.contactName,
      conversationSubject: conversation.conversationSubject,
      conversationUrl: buildConversationUrl(input.conversationId, input.requestOrigin),
      assignedBy,
    });
  } catch (error) {
    console.error("[conversation-notifications] failed: QA follow-up", {
      conversationId: input.conversationId,
      orgId: input.orgId,
      recipientEmail: recipient.email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
