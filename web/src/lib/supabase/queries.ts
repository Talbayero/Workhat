/**
 * Supabase query functions — replaces mock-data arrays with real DB calls.
 * All functions are async and must be called from server components or
 * server actions. For client components, fetch via page.tsx and pass as props.
 */

import { createClient } from "@/lib/supabase/server";
import { buildAiImprovementInsights } from "@/lib/ai-improvement-engine/insights";
import type {
  AiImprovementInsights,
  ImprovementEditRow,
  ImprovementKnowledgeEntry,
} from "@/lib/ai-improvement-engine/types";
import type {
  InboxConversation,
  InboxViewId,
  ContactRecord,
  CompanyRecord,
  KnowledgeEntry,
  KnowledgeCategory,
  RiskLevel,
  SlaStatus,
} from "@/lib/mock-data";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a DB timestamptz into a human-readable relative string. */
function relativeTime(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return new Date(ts).toLocaleDateString();
}

/** Split a notes text blob into an array of bullet strings. */
function splitNotes(notes: string | null): string[] {
  if (!notes) return [];
  return notes
    .split(/\n+/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/** Count open conversations for a contact (from an already-fetched list). */
function countOpen(
  convs: { contact_id: string | null; status: string }[],
  contactId: string
): number {
  return convs.filter(
    (c) =>
      c.contact_id === contactId &&
      c.status !== "closed"
  ).length;
}
async function getCurrentOrgId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase
    .from("users")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .single();

  return (appUser as { org_id?: string } | null)?.org_id ?? null;
}

// ── Conversations ─────────────────────────────────────────────────────────────

type DbConversation = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  contact_id: string | null;
  company_id: string | null;
  assigned_user_id?: string | null;
  assigned_to_name: string;
  risk_level: string;
  ai_confidence: string;
  preview: string;
  intent: string;
  tags: string[];
  last_message_at: string;
  sla_status?: string | null;
  sla_target?: string | null;
  sla_due_at?: string | null;
  sla_breached_at?: string | null;
  sla_last_evaluated_at?: string | null;
  contacts: { full_name: string; email: string | null; phone: string; tier: string; notes: string; tags: string[] } | null;
  companies: { name: string } | null;
  channels?: { type: string | null } | null;
};

function dbConvToFrontend(row: DbConversation): InboxConversation {
  return {
    id: row.id,
    contactId: row.contact_id ?? "",
    customerName: row.contacts?.full_name ?? "Unknown",
    companyId: row.company_id ?? "",
    companyName: row.companies?.name ?? "",
    subject: row.subject,
    preview: row.preview,
    status: row.status as InboxConversation["status"],
    channel: "email",
    riskLevel: row.risk_level as RiskLevel,
    aiConfidence: row.ai_confidence as RiskLevel,
    assignee: row.assigned_to_name,
    lastSeen: relativeTime(row.last_message_at),
    lastMessageAt: row.last_message_at,
    tags: row.tags ?? [],
    intent: row.intent,
    sla: {
      status: (row.sla_status ?? "not_applicable") as SlaStatus,
      target: row.sla_target as NonNullable<InboxConversation["sla"]>["target"],
      dueAt: row.sla_due_at ?? null,
      breachedAt: row.sla_breached_at ?? null,
      lastEvaluatedAt: row.sla_last_evaluated_at ?? null,
    },
    messages: [], // populated separately in getConversationById
    aiDraft: {
      rationale: "No AI draft has been generated for this thread yet.",
      missingContext: [],
      suggestions: [],
      draftText: "",
    },
    profile: {
      email: row.contacts?.email ?? "",
      phone: row.contacts?.phone ?? "",
      tier: row.contacts?.tier ?? "",
      notes: splitNotes(row.contacts?.notes ?? null),
      openIssues: [],
    },
  };
}

export async function getConversations(
  view?: InboxViewId
): Promise<InboxConversation[]> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return [];

  let query = supabase
    .from("conversations")
    .select(
      `id, subject, status, priority, contact_id, company_id, assigned_to_name,
       assigned_user_id, risk_level, ai_confidence, preview, intent, tags, last_message_at,
       sla_status, sla_target, sla_due_at, sla_breached_at, sla_last_evaluated_at,
       contacts(full_name, email, phone, tier, notes, tags),
       companies(name), channels(type)`
    )
    .eq("org_id", orgId)
    .order("last_message_at", { ascending: false });

  // Apply view filter at DB level where possible
  if (view === "mine") {
    // "mine" filtered client-side since we don't have current user's name easily here
  } else if (view === "high-risk") {
    query = query.in("risk_level", ["red", "yellow"]);
  } else if (view === "ai-review") {
    query = query.in("ai_confidence", ["red", "yellow"]);
  } else if (view === "unassigned") {
    query = query.eq("assigned_to_name", "");
  } else if (view === "sla-at-risk") {
    query = query.eq("sla_status", "at_risk");
  } else if (view === "sla-breached") {
    query = query.eq("sla_status", "breached");
  }

  const { data, error } = await query;
  if (error) {
    console.error("[queries] getConversations error:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as DbConversation[]).map(dbConvToFrontend);
}

export async function getConversationById(
  id: string
): Promise<InboxConversation | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: appUser } = await supabase
    .from("users")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!appUser) return null;
  const orgId = (appUser as { org_id: string }).org_id;

  const [convRes, msgRes] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        `id, subject, status, priority, contact_id, company_id, assigned_to_name,
         assigned_user_id, risk_level, ai_confidence, preview, intent, tags, last_message_at,
         sla_status, sla_target, sla_due_at, sla_breached_at, sla_last_evaluated_at,
         contacts(full_name, email, phone, tier, notes, tags),
         companies(name), channels(type)`
      )
      .eq("id", id)
      .eq("org_id", orgId)
      .single(),
    supabase
      .from("messages")
      .select("id, sender_type, author_name, body_text, is_note, created_at")
      .eq("conversation_id", id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);

  if (convRes.error || !convRes.data) return null;

  const conv = dbConvToFrontend(convRes.data as unknown as DbConversation);
  conv.messages = (msgRes.data ?? []).map((m) => ({
    id: m.id,
    sender: m.author_name,
    senderType: m.sender_type as InboxConversation["messages"][number]["senderType"],
    timestamp: relativeTime(m.created_at),
    body: m.body_text,
  }));

  return conv;
}

export async function getConversationsForContact(
  contactId: string
): Promise<InboxConversation[]> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `id, subject, status, priority, contact_id, company_id, assigned_to_name,
       assigned_user_id, risk_level, ai_confidence, preview, intent, tags, last_message_at,
       sla_status, sla_target, sla_due_at, sla_breached_at, sla_last_evaluated_at,
       contacts(full_name, email, phone, tier, notes, tags),
       companies(name), channels(type)`
    )
    .eq("contact_id", contactId)
    .eq("org_id", orgId)
    .order("last_message_at", { ascending: false });

  if (error) return [];
  return ((data ?? []) as unknown as DbConversation[]).map(dbConvToFrontend);
}

export async function getConversationsForCompany(
  companyId: string
): Promise<InboxConversation[]> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `id, subject, status, priority, contact_id, company_id, assigned_to_name,
       assigned_user_id, risk_level, ai_confidence, preview, intent, tags, last_message_at,
       sla_status, sla_target, sla_due_at, sla_breached_at, sla_last_evaluated_at,
       contacts(full_name, email, phone, tier, notes, tags),
       companies(name), channels(type)`
    )
    .eq("company_id", companyId)
    .eq("org_id", orgId)
    .order("last_message_at", { ascending: false });

  if (error) return [];
  return ((data ?? []) as unknown as DbConversation[]).map(dbConvToFrontend);
}

// ── Queue health ─────────────────────────────────────────────────────────────

export type QueueFilters = {
  sla?: "all" | "at_risk" | "breached" | "ok";
  risk?: "all" | RiskLevel;
  assignee?: string;
  status?: "all" | InboxConversation["status"];
  channel?: "all" | "email";
  intent?: string;
};

export type QueueAgingBucket = {
  id: "under_1h" | "one_to_four_h" | "four_to_24h" | "over_24h";
  label: string;
  count: number;
};

export type QueueHealth = {
  active: number;
  atRisk: number;
  breached: number;
  highRisk: number;
  unassigned: number;
  backlogPressure: number;
  agingBuckets: QueueAgingBucket[];
  assignees: string[];
  statuses: string[];
  intents: string[];
  channels: string[];
};

const ACTIVE_CONVERSATION_STATUSES = ["open", "waiting_on_customer", "waiting_on_internal"];

function ageHours(row: InboxConversation) {
  const ts = row.lastMessageAt ? new Date(row.lastMessageAt).getTime() : Date.now();
  return Math.max(0, (Date.now() - ts) / 3_600_000);
}

function emptyAgingBuckets(): QueueAgingBucket[] {
  return [
    { id: "under_1h", label: "< 1h", count: 0 },
    { id: "one_to_four_h", label: "1-4h", count: 0 },
    { id: "four_to_24h", label: "4-24h", count: 0 },
    { id: "over_24h", label: "24h+", count: 0 },
  ];
}

function buildQueueHealth(conversations: InboxConversation[]): QueueHealth {
  const agingBuckets = emptyAgingBuckets();
  for (const conversation of conversations) {
    const hours = ageHours(conversation);
    if (hours < 1) agingBuckets[0]!.count += 1;
    else if (hours < 4) agingBuckets[1]!.count += 1;
    else if (hours < 24) agingBuckets[2]!.count += 1;
    else agingBuckets[3]!.count += 1;
  }

  const atRisk = conversations.filter((c) => c.sla?.status === "at_risk").length;
  const breached = conversations.filter((c) => c.sla?.status === "breached").length;
  const highRisk = conversations.filter((c) => c.riskLevel === "red" || c.riskLevel === "yellow").length;
  const unassigned = conversations.filter((c) => !c.assignee).length;
  const active = conversations.length;
  const pressureInputs = breached * 3 + atRisk * 2 + highRisk + unassigned;

  return {
    active,
    atRisk,
    breached,
    highRisk,
    unassigned,
    backlogPressure: active === 0 ? 0 : Math.min(100, Math.round((pressureInputs / Math.max(active, 1)) * 20)),
    agingBuckets,
    assignees: [...new Set(conversations.map((c) => c.assignee).filter(Boolean))].sort(),
    statuses: [...new Set(conversations.map((c) => c.status))].sort(),
    intents: [...new Set(conversations.map((c) => c.intent || "unclassified"))].sort(),
    channels: [...new Set(conversations.map((c) => c.channel))].sort(),
  };
}

function applyQueueFilters(conversations: InboxConversation[], filters: QueueFilters) {
  return conversations.filter((conversation) => {
    if (filters.sla && filters.sla !== "all" && conversation.sla?.status !== filters.sla) return false;
    if (filters.risk && filters.risk !== "all" && conversation.riskLevel !== filters.risk) return false;
    if (filters.status && filters.status !== "all" && conversation.status !== filters.status) return false;
    if (filters.channel && filters.channel !== "all" && conversation.channel !== filters.channel) return false;
    if (filters.intent && filters.intent !== "all" && (conversation.intent || "unclassified") !== filters.intent) return false;
    if (filters.assignee && filters.assignee !== "all") {
      if (filters.assignee === "unassigned") return !conversation.assignee;
      return conversation.assignee === filters.assignee;
    }
    return true;
  });
}

export async function getQueueHealth(filters: QueueFilters = {}): Promise<{
  health: QueueHealth;
  conversations: InboxConversation[];
}> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) {
    return {
      health: buildQueueHealth([]),
      conversations: [],
    };
  }

  const { data, error } = await supabase
    .from("conversations")
    .select(
      `id, subject, status, priority, contact_id, company_id, assigned_to_name,
       assigned_user_id, risk_level, ai_confidence, preview, intent, tags, last_message_at,
       sla_status, sla_target, sla_due_at, sla_breached_at, sla_last_evaluated_at,
       contacts(full_name, email, phone, tier, notes, tags),
       companies(name), channels(type)`
    )
    .eq("org_id", orgId)
    .in("status", ACTIVE_CONVERSATION_STATUSES)
    .order("sla_due_at", { ascending: true, nullsFirst: false })
    .order("last_message_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[queries] getQueueHealth error:", error.message);
    return {
      health: buildQueueHealth([]),
      conversations: [],
    };
  }

  const conversations = ((data ?? []) as unknown as DbConversation[]).map(dbConvToFrontend);
  return {
    health: buildQueueHealth(conversations),
    conversations: applyQueueFilters(conversations, filters).slice(0, 100),
  };
}

// ── Contacts ──────────────────────────────────────────────────────────────────

type DbContact = {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  company_id: string | null;
  status: string;
  tier: string;
  notes: string;
  tags: string[];
  preferred_channel: string;
  location: string;
  lifecycle_stage: string;
  last_activity_at: string;
  companies: { id: string; name: string; industry: string; account_owner: string; open_conversations: number; active_contacts: number; tier: string } | null;
};

function dbContactToFrontend(
  row: DbContact,
  openConversationCount = 0
): ContactRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    firstName: row.first_name,
    lastName: row.last_name,
    companyId: row.company_id ?? "",
    companyName: row.companies?.name ?? "",
    email: row.email ?? "",
    phone: row.phone,
    owner: "", // no owner field on contact — could add later
    tier: row.tier,
    status: row.status as ContactRecord["status"],
    tags: row.tags ?? [],
    lastActivity: relativeTime(row.last_activity_at),
    openConversationCount,
    notes: splitNotes(row.notes),
    openIssues: [],
    editableFields: {
      preferredChannel: row.preferred_channel,
      location: row.location,
      lifecycleStage: row.lifecycle_stage,
    },
  };
}

export async function getContacts(view?: string): Promise<ContactRecord[]> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return [];

  let query = supabase
    .from("contacts")
    .select(
      `id, full_name, first_name, last_name, email, phone, company_id,
       status, tier, notes, tags, preferred_channel, location, lifecycle_stage,
       last_activity_at,
       companies(id, name, industry, account_owner, open_conversations, active_contacts, tier)`
    )
    .eq("org_id", orgId)
    .order("last_activity_at", { ascending: false });

  if (view && view !== "all") {
    if (view === "manual") {
      query = query.eq("status", "manual");
    } else {
      query = query.eq("status", view as string);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("[queries] getContacts error:", error.message);
    return [];
  }

  // Get open conversation counts for all returned contacts
  const contactIds = (data ?? []).map((c) => c.id);
  if (contactIds.length === 0) return [];

  const { data: convCounts } = await supabase
    .from("conversations")
    .select("contact_id, status")
    .in("contact_id", contactIds)
    .eq("org_id", orgId);

  const convRows = (convCounts ?? []) as { contact_id: string | null; status: string }[];

  return ((data ?? []) as unknown as DbContact[]).map((row) =>
    dbContactToFrontend(row, countOpen(convRows, row.id))
  );
}

export async function getContactById(
  id: string
): Promise<ContactRecord | null> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return null;

  const { data, error } = await supabase
    .from("contacts")
    .select(
      `id, full_name, first_name, last_name, email, phone, company_id,
       status, tier, notes, tags, preferred_channel, location, lifecycle_stage,
       last_activity_at,
       companies(id, name, industry, account_owner, open_conversations, active_contacts, tier)`
    )
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (error || !data) return null;

  // Count open conversations for this contact
  const { data: convRows } = await supabase
    .from("conversations")
    .select("contact_id, status")
    .eq("contact_id", id)
    .eq("org_id", orgId);

  const open = countOpen(
    (convRows ?? []) as { contact_id: string | null; status: string }[],
    id
  );

  return dbContactToFrontend(data as unknown as DbContact, open);
}

export async function getContactsForCompany(
  companyId: string
): Promise<ContactRecord[]> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return [];

  const { data, error } = await supabase
    .from("contacts")
    .select(
      `id, full_name, first_name, last_name, email, phone, company_id,
       status, tier, notes, tags, preferred_channel, location, lifecycle_stage,
       last_activity_at,
       companies(id, name, industry, account_owner, open_conversations, active_contacts, tier)`
    )
    .eq("company_id", companyId)
    .eq("org_id", orgId)
    .order("last_activity_at", { ascending: false });

  if (error) return [];

  const contactIds = (data ?? []).map((c) => c.id);
  if (contactIds.length === 0) return [];

  const { data: convCounts } = await supabase
    .from("conversations")
    .select("contact_id, status")
    .in("contact_id", contactIds)
    .eq("org_id", orgId);

  const convRows = (convCounts ?? []) as { contact_id: string | null; status: string }[];
  return ((data ?? []) as unknown as DbContact[]).map((row) =>
    dbContactToFrontend(row, countOpen(convRows, row.id))
  );
}

// ── Companies ─────────────────────────────────────────────────────────────────

type DbCompany = {
  id: string;
  name: string;
  domain: string | null;
  industry: string;
  account_owner: string;
  tier: string;
  health_score: number | null;
  open_conversations: number;
  active_contacts: number;
  arr: number | null;
  notes: string;
  tags: string[];
};

function dbCompanyToFrontend(row: DbCompany): CompanyRecord {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    accountOwner: row.account_owner,
    activeContacts: row.active_contacts,
    openConversations: row.open_conversations,
    tier: row.tier as CompanyRecord["tier"],
  };
}

export async function getCompanies(view?: string): Promise<CompanyRecord[]> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return [];

  let query = supabase
    .from("companies")
    .select(
      `id, name, domain, industry, account_owner, tier,
       health_score, open_conversations, active_contacts, arr, notes, tags`
    )
    .eq("org_id", orgId)
    .order("name");

  if (view && view !== "all") {
    if (view === "active") {
      query = query.gt("open_conversations", 0);
    } else {
      query = query.eq("tier", view as string);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("[queries] getCompanies error:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as DbCompany[]).map(dbCompanyToFrontend);
}

export async function getCompanyById(
  id: string
): Promise<CompanyRecord | null> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return null;

  const { data, error } = await supabase
    .from("companies")
    .select(
      `id, name, domain, industry, account_owner, tier,
       health_score, open_conversations, active_contacts, arr, notes, tags`
    )
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (error || !data) return null;
  return dbCompanyToFrontend(data as unknown as DbCompany);
}

// ── Knowledge ─────────────────────────────────────────────────────────────────

type DbKnowledgeEntry = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string[];
  used_in_drafts: number;
  is_active: boolean;
  last_updated: string;
  updated_by: string;
  knowledge_chunks: { id: string; chunk_index: number; text: string }[];
};

function dbKnowledgeToFrontend(row: DbKnowledgeEntry): KnowledgeEntry {
  return {
    id: row.id,
    title: row.title,
    category: row.category as KnowledgeCategory,
    summary: row.summary,
    body: row.body,
    tags: row.tags ?? [],
    lastUpdated: relativeTime(row.last_updated ? `${row.last_updated}T00:00:00Z` : null),
    updatedBy: row.updated_by,
    usedInDrafts: row.used_in_drafts,
    isActive: row.is_active ?? true,
    chunks: (row.knowledge_chunks ?? [])
      .sort((a, b) => a.chunk_index - b.chunk_index)
      .map((c) => ({ id: c.id, text: c.text })),
  };
}

export async function getKnowledgeEntries(
  category?: KnowledgeCategory | "all"
): Promise<KnowledgeEntry[]> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return [];

  let query = supabase
    .from("knowledge_entries")
    .select(
      `id, title, summary, body, category, tags, used_in_drafts, is_active, last_updated, updated_by,
       knowledge_chunks:knowledge_chunks(id, chunk_index, text)`
    )
    .eq("org_id", orgId)
    .order("used_in_drafts", { ascending: false });

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[queries] getKnowledgeEntries error:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as DbKnowledgeEntry[]).map(
    dbKnowledgeToFrontend
  );
}

export async function getKnowledgeEntryById(
  id: string
): Promise<KnowledgeEntry | null> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return null;

  const { data, error } = await supabase
    .from("knowledge_entries")
    .select(
      `id, title, summary, body, category, tags, used_in_drafts, is_active, last_updated, updated_by,
       knowledge_chunks:knowledge_chunks(id, chunk_index, text)`
    )
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (error || !data) return null;
  return dbKnowledgeToFrontend(data as unknown as DbKnowledgeEntry);
}

// ── Dashboard analytics ───────────────────────────────────────────────────────

export type EditTypeKey =
  | "accepted"
  | "tone"
  | "policy"
  | "missing_context"
  | "factual"
  | "structure"
  | "full_rewrite";

export type DashboardStats = {
  totalEdits: number;
  acceptanceRate: number;        // 0-100
  avgEditIntensity: number;      // 0-100
  topEditType: EditTypeKey | null;
  byType: Record<EditTypeKey, number>;
};

export type EditLogEntry = {
  id: string;
  conversationId: string;
  editType: EditTypeKey;
  editIntensity: number;
  finalText: string;
  createdAt: string;
};

const EDIT_TYPE_KEYS: EditTypeKey[] = [
  "accepted", "tone", "policy", "missing_context",
  "factual", "structure", "full_rewrite",
];

function emptyByType(): Record<EditTypeKey, number> {
  return Object.fromEntries(EDIT_TYPE_KEYS.map((k) => [k, 0])) as Record<EditTypeKey, number>;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);

  if (!orgId) {
    return {
      totalEdits: 0,
      acceptanceRate: 0,
      avgEditIntensity: 0,
      topEditType: null,
      byType: emptyByType(),
    };
  }

  const { data, error } = await supabase
    .from("edit_analyses")
    .select("id, change_percent, categories, conversation_id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500); // cap for perf — enough for stats

  if (error || !data || data.length === 0) {
    return {
      totalEdits: 0,
      acceptanceRate: 0,
      avgEditIntensity: 0,
      topEditType: null,
      byType: emptyByType(),
    };
  }

  const byType = emptyByType();
  let totalIntensity = 0;
  let accepted = 0;

  for (const row of data) {
    const intensity = Number(row.change_percent ?? 0);
    totalIntensity += intensity;

    const cats = (row.categories ?? []) as string[];
    if (intensity < 10 || cats.includes("accepted")) {
      accepted++;
      byType.accepted++;
    } else {
      // First non-accepted category wins for the breakdown
      const editCat = cats.find((c) =>
        EDIT_TYPE_KEYS.includes(c as EditTypeKey) && c !== "accepted"
      ) as EditTypeKey | undefined;
      if (editCat) byType[editCat]++;
    }
  }

  const total = data.length;
  const topEditType =
    (Object.entries(byType) as [EditTypeKey, number][])
      .filter(([k]) => k !== "accepted")
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  return {
    totalEdits: total,
    acceptanceRate: Math.round((accepted / total) * 100),
    avgEditIntensity: Math.round(totalIntensity / total),
    topEditType,
    byType,
  };
}

export async function getRecentEditLog(limit = 8): Promise<EditLogEntry[]> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return [];

  const { data, error } = await supabase
    .from("edit_analyses")
    .select(
      `id, conversation_id, change_percent, categories,
       sent_replies(body_text)`
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => {
    const cats = (row.categories ?? []) as string[];
    const intensity = Number(row.change_percent ?? 0);

    let editType: EditTypeKey = "accepted";
    if (intensity >= 10) {
      const found = cats.find(
        (c) => EDIT_TYPE_KEYS.includes(c as EditTypeKey) && c !== "accepted"
      ) as EditTypeKey | undefined;
      editType = found ?? "structure";
    }

    const replyRaw = row.sent_replies as
      | { body_text: string }
      | { body_text: string }[]
      | null;
    const finalText = Array.isArray(replyRaw)
      ? (replyRaw[0]?.body_text ?? "")
      : (replyRaw?.body_text ?? "");

    return {
      id: row.id,
      conversationId: row.conversation_id,
      editType,
      editIntensity: Math.round(intensity),
      finalText,
      createdAt: "",
    };
  });
}

export type KnowledgeHealthPattern = {
  category: EditTypeKey | "other";
  count: number;
  avgEditIntensity: number;
  sampleReasons: string[];
};

function normalizeKnowledgeCategory(categories: string[], intensity: number): EditTypeKey | "other" | "accepted" {
  if (intensity < 10 || categories.includes("accepted")) return "accepted";

  const matched = categories.find(
    (category) => EDIT_TYPE_KEYS.includes(category as EditTypeKey) && category !== "accepted"
  ) as EditTypeKey | undefined;

  return matched ?? "other";
}

export async function getKnowledgeHealth(limit = 4): Promise<KnowledgeHealthPattern[]> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return [];

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await supabase
    .from("edit_analyses")
    .select("categories, change_percent, likely_reason_summary, created_at")
    .eq("org_id", orgId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data || data.length === 0) return [];

  const grouped = new Map<EditTypeKey | "other", { count: number; totalIntensity: number; reasons: string[] }>();

  for (const row of data) {
    const categories = Array.isArray(row.categories) ? (row.categories as string[]) : [];
    const intensity = Number(row.change_percent ?? 0);
    const category = normalizeKnowledgeCategory(categories, intensity);

    if (category === "accepted") continue;

    const reason = String(row.likely_reason_summary ?? "").trim();
    const existing = grouped.get(category) ?? { count: 0, totalIntensity: 0, reasons: [] };
    existing.count += 1;
    existing.totalIntensity += intensity;

    if (reason && existing.reasons.length < 3 && !existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }

    grouped.set(category, existing);
  }

  return [...grouped.entries()]
    .map(([category, value]) => ({
      category,
      count: value.count,
      avgEditIntensity: Math.round(value.totalIntensity / value.count),
      sampleReasons: value.reasons,
    }))
    .sort((a, b) => b.count - a.count || b.avgEditIntensity - a.avgEditIntensity)
      .slice(0, limit);
}

export type {
  AiImprovementInsights,
  EditPatternCluster,
  KnowledgeEntryRecommendation,
  KnowledgeGapInsight,
  PromptVersionMetric,
} from "@/lib/ai-improvement-engine/types";

export async function getAiImprovementInsights(): Promise<AiImprovementInsights> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  const empty = buildAiImprovementInsights({ edits: [], knowledgeEntries: [] });
  if (!orgId) return empty;

  const since = new Date();
  since.setDate(since.getDate() - 90);

  const [editsRes, knowledgeRes] = await Promise.all([
    supabase
      .from("edit_analyses")
      .select(
        `id, conversation_id, ai_draft_id, edit_distance_score, change_percent,
         categories, likely_reason_summary, created_at,
         ai_drafts(prompt_version, missing_context, recommended_tags),
         conversations(intent, subject)`
      )
      .eq("org_id", orgId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(750),
    supabase
      .from("knowledge_entries")
      .select("id, title, summary, body, category, tags, used_in_drafts, last_updated")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("used_in_drafts", { ascending: false })
      .limit(200),
  ]);

  if (editsRes.error) {
    console.error("[queries] getAiImprovementInsights edits error:", editsRes.error.message);
    return empty;
  }

  if (knowledgeRes.error) {
    console.error("[queries] getAiImprovementInsights knowledge error:", knowledgeRes.error.message);
  }

  return buildAiImprovementInsights({
    edits: (editsRes.data ?? []) as unknown as ImprovementEditRow[],
    knowledgeEntries: (knowledgeRes.data ?? []) as unknown as ImprovementKnowledgeEntry[],
  });
}

export async function getQAQueueFromDB(): Promise<InboxConversation[]> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return [];

  const { data, error } = await supabase
    .from("conversations")
    .select(
      `id, subject, status, priority, contact_id, company_id, assigned_to_name,
       assigned_user_id, risk_level, ai_confidence, preview, intent, tags, last_message_at,
       sla_status, sla_target, sla_due_at, sla_breached_at, sla_last_evaluated_at,
       contacts(full_name, email, phone, tier, notes, tags),
       companies(name), channels(type)`
    )
    .eq("org_id", orgId)
    .or("risk_level.eq.red,risk_level.eq.yellow,ai_confidence.eq.red,ai_confidence.eq.yellow")
    .order("last_message_at", { ascending: false })
    .limit(30);

  if (error) return [];

  const candidates = ((data ?? []) as unknown as DbConversation[]);
  const conversationIds = candidates.map((row) => row.id);
  if (conversationIds.length === 0) return [];

  const { data: reviewRows } = await supabase
    .from("qa_reviews")
    .select("conversation_id, result, created_at")
    .in("conversation_id", conversationIds)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const latestReviewResult = new Map<string, string | null>();
  for (const review of (reviewRows ?? []) as { conversation_id: string; result: string | null }[]) {
    if (!latestReviewResult.has(review.conversation_id)) {
      latestReviewResult.set(review.conversation_id, review.result);
    }
  }

  return candidates
    .filter((row) => latestReviewResult.get(row.id) !== "approved")
    .slice(0, 20)
    .map(dbConvToFrontend);
}

// ── Intent analytics ─────────────────────────────────────────────────────────

export type IntentStat = {
  intent: string;
  count: number;
  openCount: number;
  redCount: number;      // risk_level = red
  correctionCount: number; // times it was corrected away FROM this intent
};

/**
 * Returns intent volume breakdown for the org's conversations (last 90 days).
 * Also joins with correction counts so the dashboard can show misclassification pressure.
 */
export async function getIntentStats(): Promise<IntentStat[]> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return [];

  const since = new Date();
  since.setDate(since.getDate() - 90);

  // Fetch all conversations in window (capped for perf)
  const { data: convs, error: convError } = await supabase
    .from("conversations")
    .select("intent, status, risk_level")
    .eq("org_id", orgId)
    .gte("last_message_at", since.toISOString())
    .limit(2000);

  if (convError) return [];
  if (!convs || convs.length === 0) return [];

  type ConvRow = { intent: string | null; status: string | null; risk_level: string | null };

  const byIntent = new Map<string, IntentStat>();

  for (const row of convs as ConvRow[]) {
    const key = (row.intent ?? "unclassified").trim().toLowerCase() || "unclassified";
    if (!byIntent.has(key)) {
      byIntent.set(key, { intent: key, count: 0, openCount: 0, redCount: 0, correctionCount: 0 });
    }
    const stat = byIntent.get(key)!;
    stat.count++;
    if (row.status !== "closed") stat.openCount++;
    if (row.risk_level === "red") stat.redCount++;
  }

  // Fetch corrections to enrich with misclassification rate
  const { data: corrections, error: correctionsError } = await supabase
    .from("intent_corrections")
    .select("original_intent, was_changed")
    .eq("org_id", orgId)
    .gte("created_at", since.toISOString())
    .limit(1000);

  if (correctionsError) {
    return [...byIntent.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  for (const c of (corrections ?? []) as { original_intent: string | null; was_changed: boolean | null }[]) {
    if (!c.was_changed) continue;
    const key = (c.original_intent ?? "unclassified").trim().toLowerCase() || "unclassified";
    const stat = byIntent.get(key);
    if (stat) stat.correctionCount++;
  }

  return [...byIntent.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// ── Intent color map ──────────────────────────────────────────────────────────

/**
 * Returns a map of intent name (lowercase) → hex color string.
 * Used to colorize intent pills throughout the UI consistently.
 * Returns empty map on error so callers can render a fallback color.
 */
export async function getOrgIntentColors(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) return {};

  const { data } = await supabase
    .from("intents")
    .select("name, color")
    .eq("org_id", orgId);

  if (!data) return {};

  const map: Record<string, string> = {};
  for (const row of data as { name: string; color: string }[]) {
    map[row.name.trim().toLowerCase()] = row.color;
  }
  return map;
}
