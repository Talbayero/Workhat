import type { InboxConversation, InboxViewId } from "@/lib/inbox/types";

type ConversationFilterOptions = {
  currentUserId?: string | null;
  currentAgentName?: string | null;
  searchQuery?: string | null;
};

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
  options: ConversationFilterOptions = {},
): InboxConversation[] {
  const currentAgentName = options.currentAgentName?.trim();
  const searchQuery = options.searchQuery?.trim().toLowerCase();

  const filteredByView = (() => {
    switch (view) {
    case "mine":
      return list.filter((conversation) => {
        if (options.currentUserId && conversation.assignedUserId) {
          return conversation.assignedUserId === options.currentUserId;
        }

        return Boolean(currentAgentName && conversation.assignee === currentAgentName);
      });
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
  })();

  if (!searchQuery) return filteredByView;

  return filteredByView.filter((conversation) => {
    const searchableText = [
      conversation.customerName,
      conversation.companyName,
      conversation.subject,
      conversation.preview,
      conversation.intent,
      conversation.assignee,
      ...conversation.tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchQuery);
  });
}

export const conversationStatusLabel: Record<InboxConversation["status"], string> = {
  open: "Open",
  waiting_on_customer: "Waiting on customer",
  waiting_on_internal: "Waiting on team",
  closed: "Closed",
};
