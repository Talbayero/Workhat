/**
 * Supabase query functions — replaces mock-data arrays with real DB calls.
 * All functions are async and must be called from server components or
 * server actions. For client components, fetch via page.tsx and pass as props.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  InboxConversation,
  InboxViewId,
  ContactRecord,
  CompanyRecord,
  KnowledgeEntry,
  KnowledgeCategory,
  RiskLevel,
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
      !["resolved", "archived"].includes(c.status)
  ).length;
}

// ── Conversations ─────────────────────────────────────────────────────────────

type DbConversation = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  contact_id: string | null;
  company_id: string | null;
  assigned_to_name: string;
  risk_level: string;
  ai_confidence: string;
  preview: string;
  intent: string;
  tags: string[];
  last_message_at: string;
  contacts: { full_name: string; email: string | null; phone: string; tier: string; notes: string; tags: string[] } | null;
  companies: { name: string } | null;
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
    tags: row.tags ?? [],
    intent: row.intent,
    messages: [], // populated separately in getConversationById
    aiDraft: {
      rationale: "Awaiting AI draft generation (Phase 2).",
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

  let query = supabase
    .from("conversations")
    .select(
      `id, subject, status, priority, contact_id, company_id, assigned_to_name,
       risk_level, ai_confidence, preview, intent, tags, last_message_at,
       contacts(full_name, email, phone, tier, notes, tags),
       companies(name)`
    )
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

  const [convRes, msgRes] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        `id, subject, status, priority, contact_id, company_id, assigned_to_name,
         risk_level, ai_confidence, preview, intent, tags, last_message_at,
         contacts(full_name, email, phone, tier, notes, tags),
         companies(name)`
      )
      .eq("id", id)
      .single(),
    supabase
      .from("messages")
      .select("id, sender_type, author_name, body_text, is_note, created_at")
      .eq("conversation_id", id)
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
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `id, subject, status, priority, contact_id, company_id, assigned_to_name,
       risk_level, ai_confidence, preview, intent, tags, last_message_at,
       contacts(full_name, email, phone, tier, notes, tags),
       companies(name)`
    )
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false });

  if (error) return [];
  return ((data ?? []) as unknown as DbConversation[]).map(dbConvToFrontend);
}

export async function getConversationsForCompany(
  companyId: string
): Promise<InboxConversation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `id, subject, status, priority, contact_id, company_id, assigned_to_name,
       risk_level, ai_confidence, preview, intent, tags, last_message_at,
       contacts(full_name, email, phone, tier, notes, tags),
       companies(name)`
    )
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false });

  if (error) return [];
  return ((data ?? []) as unknown as DbConversation[]).map(dbConvToFrontend);
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

  let query = supabase
    .from("contacts")
    .select(
      `id, full_name, first_name, last_name, email, phone, company_id,
       status, tier, notes, tags, preferred_channel, location, lifecycle_stage,
       last_activity_at,
       companies(id, name, industry, account_owner, open_conversations, active_contacts, tier)`
    )
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
  const { data: convCounts } = await supabase
    .from("conversations")
    .select("contact_id, status")
    .in("contact_id", contactIds);

  const convRows = (convCounts ?? []) as { contact_id: string | null; status: string }[];

  return ((data ?? []) as unknown as DbContact[]).map((row) =>
    dbContactToFrontend(row, countOpen(convRows, row.id))
  );
}

export async function getContactById(
  id: string
): Promise<ContactRecord | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contacts")
    .select(
      `id, full_name, first_name, last_name, email, phone, company_id,
       status, tier, notes, tags, preferred_channel, location, lifecycle_stage,
       last_activity_at,
       companies(id, name, industry, account_owner, open_conversations, active_contacts, tier)`
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;

  // Count open conversations for this contact
  const { data: convRows } = await supabase
    .from("conversations")
    .select("contact_id, status")
    .eq("contact_id", id);

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
  const { data, error } = await supabase
    .from("contacts")
    .select(
      `id, full_name, first_name, last_name, email, phone, company_id,
       status, tier, notes, tags, preferred_channel, location, lifecycle_stage,
       last_activity_at,
       companies(id, name, industry, account_owner, open_conversations, active_contacts, tier)`
    )
    .eq("company_id", companyId)
    .order("last_activity_at", { ascending: false });

  if (error) return [];

  const contactIds = (data ?? []).map((c) => c.id);
  const { data: convCounts } = await supabase
    .from("conversations")
    .select("contact_id, status")
    .in("contact_id", contactIds);

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

  let query = supabase
    .from("companies")
    .select(
      `id, name, domain, industry, account_owner, tier,
       health_score, open_conversations, active_contacts, arr, notes, tags`
    )
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
  const { data, error } = await supabase
    .from("companies")
    .select(
      `id, name, domain, industry, account_owner, tier,
       health_score, open_conversations, active_contacts, arr, notes, tags`
    )
    .eq("id", id)
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
    chunks: (row.knowledge_chunks ?? [])
      .sort((a, b) => a.chunk_index - b.chunk_index)
      .map((c) => ({ id: c.id, text: c.text })),
  };
}

export async function getKnowledgeEntries(
  category?: KnowledgeCategory | "all"
): Promise<KnowledgeEntry[]> {
  const supabase = await createClient();

  let query = supabase
    .from("knowledge_entries")
    .select(
      `id, title, summary, body, category, tags, used_in_drafts, last_updated, updated_by,
       knowledge_chunks(id, chunk_index, text)`
    )
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
  const { data, error } = await supabase
    .from("knowledge_entries")
    .select(
      `id, title, summary, body, category, tags, used_in_drafts, last_updated, updated_by,
       knowledge_chunks(id, chunk_index, text)`
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return dbKnowledgeToFrontend(data as unknown as DbKnowledgeEntry);
}
