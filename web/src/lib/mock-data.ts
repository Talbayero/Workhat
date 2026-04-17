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
  tier: "priority" | "watch" | "standard";
};

export type InboxConversation = {
  id: string;
  contactId: string;
  customerName: string;
  companyId: string;
  companyName: string;
  subject: string;
  preview: string;
  status: "open" | "waiting_on_customer" | "waiting_on_internal" | "resolved" | "archived";
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

export type InboxViewId = "all" | "mine" | "unassigned" | "high-risk" | "ai-review" | "unclassified";

export const inboxViews: { id: InboxViewId; label: string; count: number }[] = [
  { id: "all", label: "All conversations", count: 42 },
  { id: "mine", label: "Mine", count: 11 },
  { id: "unassigned", label: "Unassigned", count: 6 },
  { id: "high-risk", label: "High risk", count: 4 },
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
      return list.filter((c) => c.assignee === currentAgent);
    case "unassigned":
      return list.filter((c) => !c.assignee || c.assignee === "");
    case "high-risk":
      return list.filter((c) => c.riskLevel === "red" || c.riskLevel === "yellow");
    case "ai-review":
      return list.filter((c) => c.aiConfidence === "red" || c.aiConfidence === "yellow");
    case "unclassified":
      return list.filter((c) => !c.intent || c.intent.toLowerCase() === "unclassified");
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
    tier: "priority",
  },
  {
    id: "company-peak-trail",
    name: "Peak Trail Co.",
    industry: "Outdoor retail",
    accountOwner: "Anika",
    activeContacts: 2,
    openConversations: 2,
    tier: "standard",
  },
  {
    id: "company-fieldmade",
    name: "Fieldmade Studio",
    industry: "Design services",
    accountOwner: "Marcos",
    activeContacts: 3,
    openConversations: 1,
    tier: "watch",
  },
  {
    id: "company-brightwave",
    name: "Brightwave",
    industry: "SaaS / software",
    accountOwner: "Jordan",
    activeContacts: 5,
    openConversations: 3,
    tier: "priority",
  },
  {
    id: "company-mesa-dental",
    name: "Mesa Dental Group",
    industry: "Healthcare",
    accountOwner: "Anika",
    activeContacts: 2,
    openConversations: 2,
    tier: "watch",
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
  {
    id: "contact-lena-okafor",
    fullName: "Lena Okafor",
    firstName: "Lena",
    lastName: "Okafor",
    companyId: "company-brightwave",
    companyName: "Brightwave",
    email: "lena@brightwave.io",
    phone: "+1 (512) 555-0133",
    owner: "Jordan",
    tier: "Enterprise",
    status: "vip",
    tags: ["integration", "enterprise", "escalated"],
    lastActivity: "just now",
    openConversationCount: 2,
    notes: [
      "Technical lead — routes all support through herself.",
      "Escalation-prone when issues are not acknowledged within 1h.",
    ],
    openIssues: ["API integration broken after latest deploy", "Onboarding blocked"],
    editableFields: {
      preferredChannel: "Email",
      location: "Austin, TX",
      lifecycleStage: "Active customer",
    },
  },
  {
    id: "contact-raj-sharma",
    fullName: "Raj Sharma",
    firstName: "Raj",
    lastName: "Sharma",
    companyId: "company-mesa-dental",
    companyName: "Mesa Dental Group",
    email: "raj@mesadental.com",
    phone: "+1 (602) 555-0179",
    owner: "Anika",
    tier: "Growth account",
    status: "active",
    tags: ["billing", "payment"],
    lastActivity: "45 min ago",
    openConversationCount: 1,
    notes: ["Operations manager. Handles billing and vendor relationships."],
    openIssues: ["Payment failed — subscription at risk"],
    editableFields: {
      preferredChannel: "Email",
      location: "Phoenix, AZ",
      lifecycleStage: "Renewal risk",
    },
  },
  {
    id: "contact-priya-chen",
    fullName: "Priya Chen",
    firstName: "Priya",
    lastName: "Chen",
    companyId: "company-brightwave",
    companyName: "Brightwave",
    email: "priya@brightwave.io",
    phone: "+1 (512) 555-0166",
    owner: "Jordan",
    tier: "Enterprise",
    status: "active",
    tags: ["access", "onboarding"],
    lastActivity: "1 h ago",
    openConversationCount: 1,
    notes: ["New hire at Brightwave, blocked on account setup."],
    openIssues: ["Cannot access admin panel"],
    editableFields: {
      preferredChannel: "Email",
      location: "Austin, TX",
      lifecycleStage: "Onboarding",
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

// ─── Additional conversations ─────────────────────────────────────────────────

conversations.push(
  // mine + no risk → Marcos, normal
  {
    id: "conv-feature-request",
    contactId: "contact-david-rojas",
    customerName: "David Rojas",
    companyId: "company-peak-trail",
    companyName: "Peak Trail Co.",
    subject: "Can we get bulk export for order history?",
    preview: "We need to pull the last 12 months of orders into a spreadsheet for our accountant.",
    status: "waiting_on_customer",
    channel: "email",
    riskLevel: "green",
    aiConfidence: "green",
    assignee: "Marcos",
    lastSeen: "1 h ago",
    tags: ["feature", "export"],
    intent: "Feature request",
    messages: [
      {
        id: "m1",
        sender: "David Rojas",
        senderType: "customer",
        timestamp: "10:05",
        body: "Hi, is there a way to bulk export our full order history as a CSV or Excel file? We need it for end-of-year accounting.",
      },
    ],
    aiDraft: {
      rationale: "Standard feature inquiry. Bulk export is not in scope for the current plan but can be routed to product.",
      missingContext: [],
      suggestions: ["confirm current plan limits", "link to roadmap or submit feedback form"],
      draftText:
        "Hi David, bulk CSV export is not available in the current plan, but it's on our product roadmap. I can submit this as a feature request on your behalf — would you like me to do that?",
    },
    profile: {
      email: "david@peaktrail.co",
      phone: "+1 (206) 555-0120",
      tier: "Growth account",
      notes: ["Long-term customer with high reorder frequency."],
      openIssues: ["Return fee exception"],
    },
  },

  // unassigned + red risk + red confidence → shows in high-risk, ai-review, unassigned
  {
    id: "conv-api-broken",
    contactId: "contact-lena-okafor",
    customerName: "Lena Okafor",
    companyId: "company-brightwave",
    companyName: "Brightwave",
    subject: "API integration returning 403 after your deploy — we are blocked",
    preview: "Your latest release broke our webhook integration. Our entire onboarding flow is down.",
    status: "waiting_on_internal",
    channel: "email",
    riskLevel: "red",
    aiConfidence: "red",
    assignee: "",
    lastSeen: "just now",
    tags: ["integration", "escalated", "enterprise"],
    intent: "Bug report",
    messages: [
      {
        id: "m1",
        sender: "Lena Okafor",
        senderType: "customer",
        timestamp: "11:22",
        body: "We deployed nothing on our end. Your API started returning 403 on all webhook calls after your maintenance window this morning. Our onboarding pipeline is completely blocked. This is an enterprise-level issue and needs immediate escalation.",
      },
      {
        id: "m2",
        sender: "Internal note",
        senderType: "internal",
        timestamp: "11:25",
        body: "Confirmed — webhook auth token rotation rolled out at 11:00 AM. Old tokens are now invalid. Engineering is preparing a hotfix but no ETA yet. Do not promise a fix time.",
      },
    ],
    aiDraft: {
      rationale: "High-severity outage. AI lacks incident details and engineering timeline — do not use this draft without filling in specifics.",
      missingContext: ["engineering ETA", "incident ID", "which token scopes are affected"],
      suggestions: [
        "acknowledge the outage explicitly",
        "cite the maintenance window as the likely cause",
        "provide a named point of contact or escalation path",
      ],
      draftText:
        "Hi Lena, I've escalated this to our engineering team. We believe this is related to our maintenance window this morning. I'll follow up with a status update as soon as I have one — I understand this is blocking critical workflows.",
    },
    profile: {
      email: "lena@brightwave.io",
      phone: "+1 (512) 555-0133",
      tier: "Enterprise",
      notes: [
        "Technical lead — routes all support through herself.",
        "Escalation-prone when issues are not acknowledged within 1h.",
      ],
      openIssues: ["API integration broken after latest deploy", "Onboarding blocked"],
    },
  },

  // unassigned + red risk → shows in high-risk, unassigned
  {
    id: "conv-payment-failed",
    contactId: "contact-raj-sharma",
    customerName: "Raj Sharma",
    companyId: "company-mesa-dental",
    companyName: "Mesa Dental Group",
    subject: "Payment failed — account shows past due",
    preview: "Our card was declined but the card is valid. Account shows past due now and staff can't log in.",
    status: "waiting_on_customer",
    channel: "email",
    riskLevel: "red",
    aiConfidence: "yellow",
    assignee: "",
    lastSeen: "45 min ago",
    tags: ["billing", "payment", "churn-risk"],
    intent: "Billing issue",
    messages: [
      {
        id: "m1",
        sender: "Raj Sharma",
        senderType: "customer",
        timestamp: "09:50",
        body: "Our auto-renewal payment failed and now our account is locked. Staff can't access the system. The card we have on file is valid — please fix this immediately.",
      },
    ],
    aiDraft: {
      rationale: "Payment failure with account lockout. Sensitive — do not promise a credit or waiver without checking account status.",
      missingContext: ["payment processor error code", "card type", "whether lockout is automatic or manual"],
      suggestions: [
        "restore access immediately if policy allows",
        "ask for a retry or alternative payment method",
        "confirm no data is at risk during lockout",
      ],
      draftText:
        "Hi Raj, I'm sorry for the disruption. I've flagged this with our billing team to investigate the declined charge. While that's being resolved, let me see if I can restore temporary access to keep your team unblocked — I'll follow up within 30 minutes.",
    },
    profile: {
      email: "raj@mesadental.com",
      phone: "+1 (602) 555-0179",
      tier: "Growth account",
      notes: ["Operations manager. Handles billing and vendor relationships."],
      openIssues: ["Payment failed — subscription at risk"],
    },
  },

  // assigned to Jordan + yellow risk + red confidence → ai-review, high-risk
  {
    id: "conv-integration-bug",
    contactId: "contact-nina-patel",
    customerName: "Nina Patel",
    companyId: "company-northstar-home",
    companyName: "Northstar Home",
    subject: "Zapier connection stopped syncing — orders not updating",
    preview: "Zapier zap broke after the platform update. New orders aren't syncing to our spreadsheet.",
    status: "waiting_on_internal",
    channel: "email",
    riskLevel: "yellow",
    aiConfidence: "red",
    assignee: "Jordan",
    lastSeen: "30 min ago",
    tags: ["integration", "zapier"],
    intent: "Bug report",
    messages: [
      {
        id: "m1",
        sender: "Nina Patel",
        senderType: "customer",
        timestamp: "08:58",
        body: "Our Zapier automation stopped working last week. New orders aren't showing up in our tracking sheet. The trigger is set correctly — I think something changed on your side.",
      },
    ],
    aiDraft: {
      rationale: "Integration issue, likely related to API changes. AI has no information about recent API changes — this draft should not be sent without engineering input.",
      missingContext: ["recent API changelog", "Zapier trigger field names that may have changed", "whether a re-authentication is needed"],
      suggestions: [
        "ask the customer to share the Zap error log",
        "check if trigger field names changed in the last release",
        "route to integration support if needed",
      ],
      draftText:
        "Hi Nina, I'm sorry the Zapier sync stopped working. Can you share a screenshot of the error from your Zap history? That will help me pinpoint whether this is a configuration change on your end or a field mapping issue on ours.",
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

  // mine (Marcos) + green → normal volume
  {
    id: "conv-upgrade-inquiry",
    contactId: "contact-sofia-nguyen",
    customerName: "Sofia Nguyen",
    companyId: "company-fieldmade",
    companyName: "Fieldmade Studio",
    subject: "Interested in upgrading to the next plan tier",
    preview: "We are growing our team and the current seat limit is getting tight.",
    status: "waiting_on_customer",
    channel: "email",
    riskLevel: "green",
    aiConfidence: "green",
    assignee: "Marcos",
    lastSeen: "2 h ago",
    tags: ["upgrade", "expansion"],
    intent: "Upgrade inquiry",
    messages: [
      {
        id: "m1",
        sender: "Sofia Nguyen",
        senderType: "customer",
        timestamp: "07:40",
        body: "We've added two people to the team and we're hitting the seat limit. Can you walk me through what the next tier includes and how the upgrade works?",
      },
    ],
    aiDraft: {
      rationale: "Expansion opportunity. Customer is ready to upgrade — provide plan details and make the process easy.",
      missingContext: [],
      suggestions: ["include pricing", "offer a call if they have questions", "confirm billing impact date"],
      draftText:
        "Hi Sofia, great to hear the team is growing! The next tier includes up to 10 seats, plus higher AI Action limits and priority support. Upgrading is instant — billing adjusts at your next renewal date. Would you like me to walk you through the options on a quick call, or shall I send over the full plan comparison?",
    },
    profile: {
      email: "sofia@fieldmade.studio",
      phone: "+1 (310) 555-0194",
      tier: "Standard",
      notes: ["Finance requests precise terminology."],
      openIssues: [],
    },
  },

  // unassigned + yellow risk + yellow confidence → high-risk, ai-review, unassigned
  {
    id: "conv-access-issue",
    contactId: "contact-priya-chen",
    customerName: "Priya Chen",
    companyId: "company-brightwave",
    companyName: "Brightwave",
    subject: "New account — can't access admin panel after invite",
    preview: "I accepted the invite and set a password, but the admin panel shows 'access denied' on every page.",
    status: "waiting_on_customer",
    channel: "email",
    riskLevel: "yellow",
    aiConfidence: "yellow",
    assignee: "",
    lastSeen: "1 h ago",
    tags: ["access", "onboarding", "permissions"],
    intent: "Access issue",
    messages: [
      {
        id: "m1",
        sender: "Priya Chen",
        senderType: "customer",
        timestamp: "10:33",
        body: "I was added to the Brightwave account as an admin last week. I accepted the invite, set my password, and logged in — but every section shows 'access denied'. I can't do anything.",
      },
    ],
    aiDraft: {
      rationale: "Likely a role/permissions mismatch. The invite may have defaulted to a non-admin role. Verify in the admin panel before responding.",
      missingContext: ["user role assigned at invite time", "whether another admin confirmed the role"],
      suggestions: [
        "ask the account owner to verify the assigned role",
        "direct the customer to Settings → Team Members if they have access",
        "check for invite expiry issues",
      ],
      draftText:
        "Hi Priya, this sounds like a permissions mismatch — the invite may have been set to a non-admin role. Could you ask the person who invited you to check your role in Settings → Team Members? If it shows anything other than Admin, they can update it and you should have access immediately.",
    },
    profile: {
      email: "priya@brightwave.io",
      phone: "+1 (512) 555-0166",
      tier: "Enterprise",
      notes: ["New hire at Brightwave, blocked on account setup."],
      openIssues: ["Cannot access admin panel"],
    },
  }
);

export function filterContacts(list: ContactRecord[], view: string): ContactRecord[] {
  switch (view) {
    case "vip":
      return list.filter((c) => c.status === "vip");
    case "active":
      return list.filter((c) => c.status === "active");
    case "watch":
      return list.filter((c) => c.status === "watch");
    case "manual":
      return list; // Phase 2: filter by data source
    default:
      return list;
  }
}

export function filterCompanies(list: CompanyRecord[], view: string): CompanyRecord[] {
  switch (view) {
    case "active":
      return list.filter((c) => c.openConversations > 0);
    case "priority":
      return list.filter((c) => c.tier === "priority");
    case "watch":
      return list.filter((c) => c.tier === "watch");
    default:
      return list;
  }
}

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
  isActive?: boolean;
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
  {
    id: "kb-new-customer-sop",
    title: "New customer onboarding SOP",
    category: "sop",
    summary:
      "Step-by-step process for onboarding a new account from signed contract to first successful reply.",
    body: `Step 1: Within 24 hours of contract signing, create the customer's account and send the magic-link invite to the primary contact.\n\nStep 2: Schedule a 30-minute kickoff call. Agenda: confirm support email forwarding, walk through inbox layout, set up at least one AI draft together.\n\nStep 3: Upload the customer's existing SOPs and policies to the knowledge base before the kickoff call. AI draft quality depends on this — do not skip it.\n\nStep 4: After the kickoff, send a follow-up email summarising the three things the customer needs to do: confirm email forwarding, invite their team, review the first AI draft.\n\nStep 5: Check in at Day 7. If the customer hasn't sent their first reply using an AI draft, flag the account for CSM review.\n\nNote: Onboarding is considered complete when the customer has sent at least 5 replies using the AI draft workflow.`,
    tags: ["onboarding", "sop", "new-customer"],
    lastUpdated: "1 week ago",
    updatedBy: "Jordan",
    usedInDrafts: 3,
    chunks: [
      { id: "kb-onboarding-c1", text: "Within 24 hours of contract signing, create the customer's account and send the magic-link invite to the primary contact." },
      { id: "kb-onboarding-c2", text: "Upload the customer's existing SOPs and policies to the knowledge base before the kickoff call. AI draft quality depends on this." },
      { id: "kb-onboarding-c3", text: "Onboarding is considered complete when the customer has sent at least 5 replies using the AI draft workflow." },
    ],
  },
  {
    id: "kb-escalation-sop",
    title: "Escalation handoff SOP",
    category: "sop",
    summary:
      "How to hand off a conversation to a manager or senior agent without losing context or making the customer repeat themselves.",
    body: `Escalation criteria: escalate when (a) the customer has repeated the same issue across more than two replies, (b) the conversation involves a refund above $500, (c) the AI confidence is red and the agent is unsure how to proceed, or (d) the customer explicitly requests a manager.\n\nStep 1: Before escalating, leave an internal note summarising: the customer's core issue, what has already been tried, what the customer expects as a resolution, and any account context the next agent needs.\n\nStep 2: Reassign the thread in the system and notify the receiving agent via Slack (#escalations) with a link to the thread.\n\nStep 3: Send the customer a holding message: "I'm connecting you with a senior member of our team who can resolve this. They'll be in touch within [timeframe]."\n\nStep 4: Do not close the thread or change its status until the receiving agent confirms they have reviewed the handoff note.`,
    tags: ["escalation", "handoff", "sop"],
    lastUpdated: "4 days ago",
    updatedBy: "Anika",
    usedInDrafts: 7,
    chunks: [
      { id: "kb-escalation-sop-c1", text: "Escalate when the customer has repeated the same issue across more than two replies, the refund is above $500, AI confidence is red, or the customer requests a manager." },
      { id: "kb-escalation-sop-c2", text: "Before escalating, leave an internal note with: core issue, what's been tried, expected resolution, and account context." },
      { id: "kb-escalation-sop-c3", text: "Send the customer a holding message before reassigning. Do not close the thread until the receiving agent confirms they have reviewed the handoff note." },
    ],
  },
  {
    id: "kb-ai-actions-product",
    title: "AI Actions — what they are and how they're counted",
    category: "product",
    summary:
      "Plain-language explanation of AI Actions for customers asking about usage, limits, and billing.",
    body: `An AI Action is consumed each time the platform uses AI on your behalf. This includes: generating a draft reply, classifying an agent edit, and retrieving knowledge base chunks to inform a draft.\n\nOne inbound email typically consumes 1–3 AI Actions: one for draft generation, one for knowledge retrieval, and one for edit classification if the agent modifies the draft before sending.\n\nAI Actions reset on the first day of your billing month. Unused Actions do not roll over.\n\nIf a customer asks why their count is higher than expected: check whether they have multiple channels active, whether auto-draft is turned on for all threads, or whether a high-volume day caused a spike. You can view the Action log in Settings → AI settings → AI Actions.\n\nOverage: Customers on the Growth plan are paused (not charged) at their limit. Enterprise customers can configure overage billing.`,
    tags: ["ai-actions", "billing", "product", "usage"],
    lastUpdated: "2 days ago",
    updatedBy: "Marcos",
    usedInDrafts: 11,
    chunks: [
      { id: "kb-ai-actions-c1", text: "An AI Action is consumed each time the platform uses AI: generating a draft, classifying an edit, or retrieving knowledge base chunks." },
      { id: "kb-ai-actions-c2", text: "One inbound email typically consumes 1–3 AI Actions. AI Actions reset on the first day of your billing month and unused Actions do not roll over." },
      { id: "kb-ai-actions-c3", text: "Growth plan customers are paused at their limit. Enterprise customers can configure overage billing." },
    ],
  },
  {
    id: "kb-tone-difficult",
    title: "Tone guide: handling frustrated or angry customers",
    category: "tone",
    summary:
      "How to de-escalate charged conversations without sounding scripted, dismissive, or over-apologetic.",
    body: `Angry customers are not attacking you — they are expressing that something important to them has gone wrong. Your job is to slow the conversation down and redirect it toward resolution.\n\nDo not:\n- Match their energy or become defensive\n- Lead with "I understand your frustration" — it reads as dismissive if not followed immediately by action\n- Promise things you cannot guarantee ("I'll make sure this never happens again")\n- Use passive voice that obscures ownership ("Mistakes were made")\n\nDo:\n- Name the specific problem they raised ("The shipment has been stuck on label-created for 48 hours")\n- State what you are doing right now, not what you will do eventually\n- Give a specific timeframe, even if it's just for your next update ("I will follow up by 3pm today")\n- If you genuinely cannot resolve the issue, say so and escalate clearly\n\nFor VIP accounts: treat the first message as if it's already an escalation. Do not wait for them to repeat themselves.`,
    tags: ["tone", "de-escalation", "angry-customer"],
    lastUpdated: "3 days ago",
    updatedBy: "Jordan",
    usedInDrafts: 18,
    chunks: [
      { id: "kb-tone-difficult-c1", text: "Name the specific problem the customer raised. Do not lead with 'I understand your frustration' unless followed immediately by a concrete action." },
      { id: "kb-tone-difficult-c2", text: "State what you are doing right now, not eventually. Give a specific timeframe, even if it's just for your next update." },
      { id: "kb-tone-difficult-c3", text: "For VIP accounts: treat the first message as if it's already an escalation. Do not wait for them to repeat themselves." },
    ],
  },
];

export function getKnowledgeEntryById(id: string) {
  return knowledgeEntries.find((entry) => entry.id === id);
}

export function filterKnowledgeEntries(category: KnowledgeCategory | "all") {
  if (category === "all") return knowledgeEntries;
  return knowledgeEntries.filter((e) => e.category === category);
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const conversationStatusLabel: Record<InboxConversation["status"], string> = {
  open: "Open",
  waiting_on_customer: "Waiting on customer",
  waiting_on_internal: "Waiting on team",
  resolved: "Resolved",
  archived: "Archived",
};

// --- Dashboard ---

export const stats = {
  totalEdits: 42,
  acceptanceRate: 68,
  avgEditIntensity: 24,
  topEditType: "factual" as const,
  byType: {
    factual: 12,
    tone: 8,
    policy: 5,
    missing_context: 10,
    structure: 4,
    full_rewrite: 3,
    accepted: 0,
  },
};

export const teamStats = [
  { id: "1", name: "Marcos", acceptance: 72, volume: 156 },
  { id: "2", name: "Anika", acceptance: 65, volume: 142 },
  { id: "3", name: "Jordan", acceptance: 69, volume: 88 },
];
