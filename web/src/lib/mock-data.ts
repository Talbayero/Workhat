export type RiskLevel = "green" | "yellow" | "red";

export type ContactRecord = {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  companyId: string;
  companyName: string;
  email: string;
  phone: string;
  owner: string;
  tier: string;
  status: "active" | "watch" | "vip";
  tags: string[];
  lastActivity: string;
  openConversationCount: number;
  notes: string[];
  openIssues: string[];
  editableFields: {
    preferredChannel: string;
    location: string;
    lifecycleStage: string;
  };
};

export type CompanyRecord = {
  id: string;
  name: string;
  industry: string;
  accountOwner: string;
  activeContacts: number;
  openConversations: number;
};

export type InboxConversation = {
  id: string;
  contactId: string;
  customerName: string;
  companyId: string;
  companyName: string;
  subject: string;
  preview: string;
  status: "waiting_on_customer" | "waiting_on_internal" | "resolved" | "archived";
  channel: "email";
  riskLevel: RiskLevel;
  aiConfidence: RiskLevel;
  assignee: string;
  lastSeen: string;
  tags: string[];
  intent: string;
  messages: {
    id: string;
    sender: string;
    senderType: "customer" | "agent" | "ai" | "internal";
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

export type InboxViewId = "all" | "mine" | "unassigned" | "high-risk" | "ai-review";

export const inboxViews: { id: InboxViewId; label: string; count: number }[] = [
  { id: "all", label: "All conversations", count: 42 },
  { id: "mine", label: "Mine", count: 11 },
  { id: "unassigned", label: "Unassigned", count: 6 },
  { id: "high-risk", label: "High risk", count: 4 },
  { id: "ai-review", label: "AI needs review", count: 8 },
];

export function filterConversations(
  list: InboxConversation[],
  view: InboxViewId,
  currentAgent = "Marcos",
): InboxConversation[] {
  switch (view) {
    case "mine":
      return list.filter((c) => c.assignee === currentAgent);
    case "unassigned":
      return list.filter((c) => !c.assignee || c.assignee === "");
    case "high-risk":
      return list.filter((c) => c.riskLevel === "red" || c.riskLevel === "yellow");
    case "ai-review":
      return list.filter((c) => c.aiConfidence === "red" || c.aiConfidence === "yellow");
    default:
      return list;
  }
}

export const insightCards = [
  { label: "AI draft acceptance", value: "68%", delta: "+9% this week" },
  {
    label: "Avg. edit intensity",
    value: "24%",
    delta: "-6% after SOP upload",
  },
  {
    label: "Top failure pattern",
    value: "Missing order context",
    delta: "31 flagged threads",
  },
] as const;

export const contactsListViews = [
  { id: "all", label: "All contacts", count: 138 },
  { id: "active", label: "Active", count: 92 },
  { id: "vip", label: "VIP", count: 18 },
  { id: "watch", label: "Watch list", count: 14 },
  { id: "manual", label: "Manual entries", count: 27 },
] as const;

export const contactFilters = [
  "Name",
  "Company",
  "Last activity",
  "Tags",
  "Owner",
  "Risk",
  "Open conversations",
  "VIP status",
] as const;

export const companies: CompanyRecord[] = [
  {
    id: "company-northstar-home",
    name: "Northstar Home",
    industry: "Home installations",
    accountOwner: "Marcos",
    activeContacts: 4,
    openConversations: 3,
  },
  {
    id: "company-peak-trail",
    name: "Peak Trail Co.",
    industry: "Outdoor retail",
    accountOwner: "Anika",
    activeContacts: 2,
    openConversations: 2,
  },
  {
    id: "company-fieldmade",
    name: "Fieldmade Studio",
    industry: "Design services",
    accountOwner: "Marcos",
    activeContacts: 3,
    openConversations: 1,
  },
];

export const contacts: ContactRecord[] = [
  {
    id: "contact-nina-patel",
    fullName: "Nina Patel",
    firstName: "Nina",
    lastName: "Patel",
    companyId: "company-northstar-home",
    companyName: "Northstar Home",
    email: "nina@northstarhome.com",
    phone: "+1 (415) 555-0182",
    owner: "Marcos",
    tier: "Priority account",
    status: "vip",
    tags: ["shipping", "vip"],
    lastActivity: "3 min ago",
    openConversationCount: 2,
    notes: [
      "Prefers concrete timelines over generic reassurance.",
      "Handles installs for end clients; delays create downstream revenue impact.",
    ],
    openIssues: ["Shipment delay", "Needs updated ETA"],
    editableFields: {
      preferredChannel: "Email",
      location: "San Francisco, CA",
      lifecycleStage: "Active customer",
    },
  },
  {
    id: "contact-david-rojas",
    fullName: "David Rojas",
    firstName: "David",
    lastName: "Rojas",
    companyId: "company-peak-trail",
    companyName: "Peak Trail Co.",
    email: "david@peaktrail.co",
    phone: "+1 (206) 555-0120",
    owner: "Anika",
    tier: "Growth account",
    status: "active",
    tags: ["refund", "policy"],
    lastActivity: "18 min ago",
    openConversationCount: 1,
    notes: ["Long-term customer with high reorder frequency."],
    openIssues: ["Return fee exception"],
    editableFields: {
      preferredChannel: "Email",
      location: "Seattle, WA",
      lifecycleStage: "Expansion",
    },
  },
  {
    id: "contact-sofia-nguyen",
    fullName: "Sofia Nguyen",
    firstName: "Sofia",
    lastName: "Nguyen",
    companyId: "company-fieldmade",
    companyName: "Fieldmade Studio",
    email: "sofia@fieldmade.studio",
    phone: "+1 (310) 555-0194",
    owner: "Marcos",
    tier: "Standard",
    status: "watch",
    tags: ["billing"],
    lastActivity: "2 h ago",
    openConversationCount: 0,
    notes: ["Finance requests precise terminology."],
    openIssues: [],
    editableFields: {
      preferredChannel: "Email",
      location: "Los Angeles, CA",
      lifecycleStage: "Active customer",
    },
  },
];

export const conversations: InboxConversation[] = [
  {
    id: "conv-shipping-delay",
    contactId: "contact-nina-patel",
    customerName: "Nina Patel",
    companyId: "company-northstar-home",
    companyName: "Northstar Home",
    subject: "Urgent: order still shows label created",
    preview:
      "I need a clearer answer than the one I got yesterday. Is the package actually moving or not?",
    status: "waiting_on_customer",
    channel: "email",
    riskLevel: "yellow",
    aiConfidence: "yellow",
    assignee: "Marcos",
    lastSeen: "3 min ago",
    tags: ["shipping", "vip"],
    intent: "WISMO",
    messages: [
      {
        id: "m1",
        sender: "Nina Patel",
        senderType: "customer",
        timestamp: "09:08",
        body:
          "Hi team, my order still shows 'label created' and the last agent said it should move today. I need a real update because this is for a client install.",
      },
      {
        id: "m2",
        sender: "AI draft",
        senderType: "ai",
        timestamp: "09:11",
        body:
          "Thanks for your patience. Your shipment is in transit and should update soon. We appreciate your understanding.",
      },
      {
        id: "m3",
        sender: "Internal note",
        senderType: "internal",
        timestamp: "09:12",
        body:
          "Order is high-value. Customer has escalated twice in the last 48 hours. Need confirmation from carrier dashboard before promising movement.",
      },
    ],
    aiDraft: {
      rationale:
        "The customer needs a status update, but carrier confirmation is missing. Avoid absolute delivery promises.",
      missingContext: ["carrier checkpoint status", "updated ETA from fulfillment"],
      suggestions: [
        "acknowledge prior frustration",
        "cite current known status",
        "offer proactive follow-up timeline",
      ],
      draftText:
        "Hi Nina, I checked the order again and I can confirm the label has been created, but I do not yet see a carrier scan showing movement. I know that is frustrating, especially after yesterday's update. I am escalating this with fulfillment now and will follow up with a confirmed status update within the next two hours.",
    },
    profile: {
      email: "nina@northstarhome.com",
      phone: "+1 (415) 555-0182",
      tier: "Priority account",
      notes: [
        "Prefers concrete timelines over generic reassurance.",
        "Handles installs for end clients; delays create downstream revenue impact.",
      ],
      openIssues: ["Shipment delay", "Needs updated ETA"],
    },
  },
  {
    id: "conv-refund-policy",
    contactId: "contact-david-rojas",
    customerName: "David Rojas",
    companyId: "company-peak-trail",
    companyName: "Peak Trail Co.",
    subject: "Can you make an exception on the return fee?",
    preview:
      "The AI reply looked polite, but it ignored the loyalty discount rule for repeat buyers.",
    status: "waiting_on_internal",
    channel: "email",
    riskLevel: "green",
    aiConfidence: "green",
    assignee: "Anika",
    lastSeen: "18 min ago",
    tags: ["refund", "policy"],
    intent: "Exception request",
    messages: [
      {
        id: "m1",
        sender: "David Rojas",
        senderType: "customer",
        timestamp: "08:41",
        body:
          "I've been ordering for two years and this is my first return. Is there any way to waive the restocking fee?",
      },
      {
        id: "m2",
        sender: "Agent note",
        senderType: "internal",
        timestamp: "08:46",
        body:
          "Loyalty exception exists for repeat buyers with 5+ orders. AI missed it because the order history wasn't pulled into context.",
      },
    ],
    aiDraft: {
      rationale:
        "Low-risk reply, but missing purchase-history context may create a policy miss.",
      missingContext: ["lifetime order count", "customer loyalty status"],
      suggestions: [
        "mention exception eligibility",
        "confirm once account history is checked",
      ],
      draftText:
        "Hi David, thanks for checking with us. Our standard return policy includes a restocking fee, but I’m reviewing your account history now to see whether we can make an exception here. I’ll confirm the final answer shortly.",
    },
    profile: {
      email: "david@peaktrail.co",
      phone: "+1 (206) 555-0120",
      tier: "Growth account",
      notes: ["Long-term customer with high reorder frequency."],
      openIssues: ["Return fee exception"],
    },
  },
  {
    id: "conv-billing-copy",
    contactId: "contact-sofia-nguyen",
    customerName: "Sofia Nguyen",
    companyId: "company-fieldmade",
    companyName: "Fieldmade Studio",
    subject: "Need invoice wording updated for our finance team",
    preview:
      "Please update the wording so it reflects annual support retainer, not consulting.",
    status: "resolved",
    channel: "email",
    riskLevel: "green",
    aiConfidence: "green",
    assignee: "Marcos",
    lastSeen: "2 h ago",
    tags: ["billing"],
    intent: "Invoice clarification",
    messages: [
      {
        id: "m1",
        sender: "Sofia Nguyen",
        senderType: "customer",
        timestamp: "07:15",
        body:
          "Finance rejected the invoice wording. Can you update it to say annual support retainer?",
      },
    ],
    aiDraft: {
      rationale: "Straightforward billing wording correction.",
      missingContext: [],
      suggestions: ["confirm revised wording", "attach corrected invoice"],
      draftText:
        "Hi Sofia, absolutely. We’ll update the invoice wording to reflect 'annual support retainer' and send the corrected version shortly.",
    },
    profile: {
      email: "sofia@fieldmade.studio",
      phone: "+1 (310) 555-0194",
      tier: "Standard",
      notes: ["Finance requests precise terminology."],
      openIssues: [],
    },
  },
];

export function getConversationById(id: string) {
  return conversations.find((conversation) => conversation.id === id);
}

export function getContactById(id: string) {
  return contacts.find((contact) => contact.id === id);
}

export function getCompanyById(id: string) {
  return companies.find((company) => company.id === id);
}

export function getConversationsForContact(contactId: string) {
  return conversations.filter((conversation) => conversation.contactId === contactId);
}

export function getContactsForCompany(companyId: string) {
  return contacts.filter((contact) => contact.companyId === companyId);
}

export function getConversationsForCompany(companyId: string) {
  return conversations.filter((conversation) => conversation.companyId === companyId);
}

// ─── Knowledge ────────────────────────────────────────────────────────────────

export type KnowledgeCategory =
  | "policy"
  | "sop"
  | "tone"
  | "product"
  | "escalation";

export type KnowledgeEntry = {
  id: string;
  title: string;
  category: KnowledgeCategory;
  summary: string;
  body: string;
  tags: string[];
  lastUpdated: string;
  updatedBy: string;
  usedInDrafts: number;
  chunks: { id: string; text: string }[];
};

export const knowledgeCategories: { id: KnowledgeCategory | "all"; label: string; count: number }[] = [
  { id: "all", label: "All entries", count: 12 },
  { id: "policy", label: "Policies", count: 4 },
  { id: "sop", label: "SOPs", count: 3 },
  { id: "tone", label: "Tone guides", count: 2 },
  { id: "product", label: "Product info", count: 2 },
  { id: "escalation", label: "Escalation paths", count: 1 },
];

export const knowledgeEntries: KnowledgeEntry[] = [
  {
    id: "kb-return-policy",
    title: "Standard return & restocking policy",
    category: "policy",
    summary:
      "Covers the 30-day return window, restocking fee structure, and loyalty exceptions for repeat buyers with 5+ orders.",
    body: `Returns are accepted within 30 days of delivery. A 15% restocking fee applies to all returns unless waived by an authorized agent.\n\nLoyalty exception: Customers with 5 or more lifetime orders who have not previously requested a fee waiver are eligible for a one-time restocking fee waiver. Agents must confirm order count in the order management system before granting the exception.\n\nEscalation: Any return exception above $500 in order value requires manager approval before processing.`,
    tags: ["returns", "policy", "loyalty"],
    lastUpdated: "2 days ago",
    updatedBy: "Marcos",
    usedInDrafts: 14,
    chunks: [
      { id: "kb-return-policy-c1", text: "Returns are accepted within 30 days of delivery. A 15% restocking fee applies to all returns unless waived by an authorized agent." },
      { id: "kb-return-policy-c2", text: "Loyalty exception: Customers with 5 or more lifetime orders who have not previously requested a fee waiver are eligible for a one-time restocking fee waiver." },
      { id: "kb-return-policy-c3", text: "Any return exception above $500 in order value requires manager approval before processing." },
    ],
  },
  {
    id: "kb-shipping-escalation",
    title: "Shipping delay escalation SOP",
    category: "escalation",
    summary:
      "Step-by-step for handling WISMO tickets where the carrier has not scanned a package within 24h of label creation.",
    body: `Step 1: Check the carrier dashboard for the most recent scan. Do not assume the label data in the order system is up to date.\n\nStep 2: If no scan is found within 24h of label creation, mark the ticket high priority and notify fulfillment via the #fulfillment-escalations Slack channel.\n\nStep 3: Do not promise a specific delivery date to the customer until fulfillment confirms the new ETA. Use this holding response:\n"I've escalated this to our fulfillment team and will follow up with a confirmed status within [timeframe]. I understand this is frustrating and want to give you accurate information rather than a guess."\n\nStep 4: Follow up within 2 hours or reassign with a handoff note.`,
    tags: ["shipping", "wismo", "escalation", "sop"],
    lastUpdated: "5 days ago",
    updatedBy: "Anika",
    usedInDrafts: 9,
    chunks: [
      { id: "kb-shipping-c1", text: "If no scan is found within 24h of label creation, mark the ticket high priority and notify fulfillment via the #fulfillment-escalations Slack channel." },
      { id: "kb-shipping-c2", text: "Do not promise a specific delivery date to the customer until fulfillment confirms the new ETA." },
      { id: "kb-shipping-c3", text: "Follow up within 2 hours or reassign with a handoff note." },
    ],
  },
  {
    id: "kb-tone-guide",
    title: "Agent tone guide: empathy without over-apologizing",
    category: "tone",
    summary:
      "How to acknowledge customer frustration while staying direct and solution-oriented. Avoid filler apologies.",
    body: `The goal is confident empathy — acknowledging feelings without losing control of the conversation.\n\nAvoid:\n- "I'm so sorry for the inconvenience" as a standalone opener (it reads as filler)\n- Repeating apologies in the same message\n- Vague commitments like "we'll look into it"\n\nUse instead:\n- Acknowledge the specific frustration ("I can see this has been waiting since yesterday")\n- State what you're doing right now ("I'm checking the carrier dashboard now")\n- Give a concrete next step with a time ("I'll follow up by 2pm today")\n\nTone rule: sound like a competent colleague handling a problem, not a customer service script.`,
    tags: ["tone", "empathy", "writing"],
    lastUpdated: "1 week ago",
    updatedBy: "Marcos",
    usedInDrafts: 22,
    chunks: [
      { id: "kb-tone-c1", text: "Avoid 'I'm so sorry for the inconvenience' as a standalone opener. It reads as filler." },
      { id: "kb-tone-c2", text: "Acknowledge the specific frustration, state what you're doing right now, give a concrete next step with a time." },
      { id: "kb-tone-c3", text: "Sound like a competent colleague handling a problem, not a customer service script." },
    ],
  },
  {
    id: "kb-invoice-wording",
    title: "Invoice terminology standards",
    category: "policy",
    summary:
      "Approved wording for billing line items. Finance teams often reject non-standard descriptions.",
    body: `Use the following approved terminology on invoices and billing communications:\n\n- "Annual support retainer" (not "consulting", not "support services")\n- "Implementation fee" (not "setup cost" or "onboarding")\n- "Usage-based AI actions" (not "AI credits" or "tokens")\n\nIf a customer's finance team rejects an invoice, send a corrected version with the approved wording within 24 hours. Do not wait for the customer to follow up.`,
    tags: ["billing", "invoice", "finance"],
    lastUpdated: "3 days ago",
    updatedBy: "Marcos",
    usedInDrafts: 5,
    chunks: [
      { id: "kb-invoice-c1", text: "Use 'Annual support retainer', not 'consulting' or 'support services'." },
      { id: "kb-invoice-c2", text: "If a customer's finance team rejects an invoice, send a corrected version within 24 hours." },
    ],
  },
];

export function getKnowledgeEntryById(id: string) {
  return knowledgeEntries.find((entry) => entry.id === id);
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const conversationStatusLabel: Record<InboxConversation["status"], string> = {
  waiting_on_customer: "Waiting on customer",
  waiting_on_internal: "Waiting on team",
  resolved: "Resolved",
  archived: "Archived",
};
