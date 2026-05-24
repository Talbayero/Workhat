import type { InboxConversation } from "@/lib/inbox/types";

export type ThreadMessage = InboxConversation["messages"][number];
export type ComposerMode = "reply" | "note";

export type MessagePresentation =
  | "customer_message"
  | "agent_reply"
  | "internal_note"
  | "activity";

export function getLatestInboundCustomerMessage(messages: ThreadMessage[]) {
  return [...messages]
    .reverse()
    .find((message) => message.senderType === "customer" && message.body.trim().length > 0) ?? null;
}

export function getMessagePresentation(message: ThreadMessage): MessagePresentation {
  const body = message.body.trim().toLowerCase();

  if (message.senderType === "customer") return "customer_message";
  if (message.senderType === "agent") return "agent_reply";
  if (message.senderType === "system" || message.senderType === "ai") return "activity";
  if (
    body.startsWith("[closure note]") ||
    body.startsWith("[system]") ||
    body.startsWith("[workflow]") ||
    body.includes("workflow event")
  ) {
    return "activity";
  }

  return "internal_note";
}

export function getReplyingToBody(body: string, expanded: boolean, maxLength = 360) {
  const normalized = body.trim();
  if (expanded || normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

export function shouldOfferFullThread(body: string, maxLength = 360) {
  return body.trim().length > maxLength;
}

export function getSendDisabledReason({
  status,
  replyText,
  latestInboundMessage,
  mode,
}: {
  status: InboxConversation["status"];
  replyText: string;
  latestInboundMessage: ThreadMessage | null;
  mode: ComposerMode;
}) {
  if (!replyText.trim()) {
    return mode === "note" ? "Write an internal note before posting." : "Write a reply before sending.";
  }

  if (mode === "note") return null;

  if (status === "closed") {
    return "Conversation is closed. Reopen it before sending a reply.";
  }

  if (!latestInboundMessage) {
    return "No latest inbound customer message exists to reply to.";
  }

  return null;
}

export function getAiDraftDisabledReason({
  status,
  latestInboundMessage,
  draftLoading,
}: {
  status: InboxConversation["status"];
  latestInboundMessage: ThreadMessage | null;
  draftLoading: boolean;
}) {
  if (draftLoading) return "AI draft is already being generated.";
  if (status === "closed") return "Conversation is closed. Reopen it before generating a draft.";
  if (!latestInboundMessage) return "No latest inbound customer message exists for AI drafting.";
  return null;
}
