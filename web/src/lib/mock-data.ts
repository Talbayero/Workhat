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
  status: "awaiting-response" | "in-progress" | "closed";
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

export const inboxViews = [
  { id: "all", label: "All conversations", count: 42 },
  { id: "mine", label: "Mine", count: 11 },
  { id: "unassigned", label: "Unassigned", count: 6 },
  { id: "high-risk", label: "High risk", count: 4 },
  { id: "ai-review", label: "AI needs review", count: 8 },
] as const;

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
    status: "awaiting-response",
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
    status: "in-progress",
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
    status: "closed",
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
