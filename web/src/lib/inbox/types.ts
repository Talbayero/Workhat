export type RiskLevel = "green" | "yellow" | "red";
export type SlaStatus = "not_applicable" | "ok" | "at_risk" | "breached";
export type EmailMessageClassification =
  | "human_customer"
  | "system_notification"
  | "auth_email"
  | "newsletter"
  | "unknown";

export type InboxConversation = {
  id: string;
  contactId: string;
  customerName: string;
  companyId: string;
  companyName: string;
  assignedUserId?: string | null;
  subject: string;
  preview: string;
  status: "open" | "waiting_on_customer" | "waiting_on_internal" | "closed";
  channel: "email";
  emailClassification?: EmailMessageClassification;
  riskLevel: RiskLevel;
  aiConfidence: RiskLevel;
  assignee: string;
  lastSeen: string;
  lastMessageAt?: string;
  tags: string[];
  intent: string;
  sla?: {
    status: SlaStatus;
    target: "first_response" | "next_response" | null;
    dueAt: string | null;
    breachedAt: string | null;
    lastEvaluatedAt: string | null;
  };
  messages: {
    id: string;
    sender: string;
    senderType: "customer" | "agent" | "ai" | "internal" | "system";
    timestamp: string;
    body: string;
  }[];
  aiDraft: {
    rationale: string;
    missingContext: string[];
    suggestions: string[];
    draftText: string;
  };
  profile: {
    email: string;
    phone: string;
    tier: string;
    notes: string[];
    openIssues: string[];
  };
};

export type InboxViewId =
  | "all"
  | "mine"
  | "unassigned"
  | "high-risk"
  | "ai-review"
  | "unclassified"
  | "automated"
  | "sla-at-risk"
  | "sla-breached";
