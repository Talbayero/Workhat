import type { InboxConversation, InboxViewId } from "@/lib/inbox/types";

export const inboxViews: { id: InboxViewId; label: string; count: number }[] = [
  { id: "all", label: "All conversations", count: 42 },
  { id: "mine", label: "Mine", count: 11 },
  { id: "unassigned", label: "Unassigned", count: 6 },
  { id: "high-risk", label: "High risk", count: 4 },
  { id: "sla-at-risk", label: "SLA at risk", count: 0 },
  { id: "sla-breached", label: "SLA breached", count: 0 },
  { id: "ai-review", label: "AI needs review", count: 8 },
  { id: "unclassified", label: "Unclassified", count: 0 },
];

export function filterConversations(
  list: InboxConversation[],
  view: InboxViewId,
  currentAgent = "Marcos",
): InboxConversation[] {
  switch (view) {
    case "mine":
      return list.filter((conversation) => conversation.assignee === currentAgent);
    case "unassigned":
      return list.filter((conversation) => !conversation.assignee || conversation.assignee === "");
    case "high-risk":
      return list.filter((conversation) => conversation.riskLevel === "red" || conversation.riskLevel === "yellow");
    case "ai-review":
      return list.filter((conversation) => conversation.aiConfidence === "red" || conversation.aiConfidence === "yellow");
    case "sla-at-risk":
      return list.filter((conversation) => conversation.sla?.status === "at_risk");
    case "sla-breached":
      return list.filter((conversation) => conversation.sla?.status === "breached");
    case "unclassified":
      return list.filter((conversation) => !conversation.intent || conversation.intent.toLowerCase() === "unclassified" || conversation.intent.trim() === "");
    default:
      return list;
  }
}

export const conversationStatusLabel: Record<InboxConversation["status"], string> = {
  open: "Open",
  waiting_on_customer: "Waiting on customer",
  waiting_on_internal: "Waiting on team",
  closed: "Closed",
};
