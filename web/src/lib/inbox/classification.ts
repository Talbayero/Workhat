import type { EmailMessageClassification, InboxConversation } from "@/lib/inbox/types";

type ClassificationInput = {
  senderName?: string | null;
  senderEmail?: string | null;
  subject?: string | null;
  preview?: string | null;
  tags?: string[] | null;
};

const AUTH_TERMS = [
  "verification code",
  "verify your email",
  "confirm your email",
  "password reset",
  "reset your password",
  "login code",
  "security code",
  "one-time code",
  "two-factor",
  "magic link",
];

const NEWSLETTER_TERMS = [
  "newsletter",
  "digest",
  "unsubscribe",
  "view in browser",
  "manage your preferences",
  "weekly update",
];

const SYSTEM_TERMS = [
  "no-reply",
  "noreply",
  "do-not-reply",
  "notification",
  "automated",
  "alert",
  "receipt",
  "invoice",
  "github",
  "jira",
  "slack",
  "vercel",
  "supabase",
];

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function classifyImportedEmail(input: ClassificationInput): EmailMessageClassification {
  const senderEmail = (input.senderEmail ?? "").trim().toLowerCase();
  const senderName = (input.senderName ?? "").trim().toLowerCase();
  const tags = (input.tags ?? []).join(" ").toLowerCase();
  const text = [
    senderEmail,
    senderName,
    input.subject ?? "",
    input.preview ?? "",
    tags,
  ]
    .join(" ")
    .toLowerCase();

  if (includesAny(text, AUTH_TERMS)) return "auth_email";
  if (includesAny(text, NEWSLETTER_TERMS)) return "newsletter";
  if (includesAny(text, SYSTEM_TERMS)) return "system_notification";

  if (senderEmail && !senderEmail.includes("no-reply") && !senderEmail.includes("noreply")) {
    return "human_customer";
  }

  return "unknown";
}

export function getConversationEmailClassification(
  conversation: InboxConversation,
): EmailMessageClassification {
  return conversation.emailClassification ?? classifyImportedEmail({
    senderName: conversation.customerName,
    senderEmail: conversation.profile.email,
    subject: conversation.subject,
    preview: conversation.preview,
    tags: conversation.tags,
  });
}

export function isDefaultOperationalClassification(classification: EmailMessageClassification) {
  return classification === "human_customer" || classification === "unknown";
}

export function isDefaultOperationalConversation(conversation: InboxConversation) {
  return isDefaultOperationalClassification(getConversationEmailClassification(conversation));
}
