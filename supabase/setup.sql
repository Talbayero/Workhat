-- ════════════════════════════════
-- 0001_extensions_and_enums.sql
-- ════════════════════════════════
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'user_role'
  ) then
    create type public.user_role as enum ('admin', 'manager', 'agent', 'qa_reviewer');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'user_status'
  ) then
    create type public.user_status as enum ('pending', 'active', 'disabled');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'channel_type'
  ) then
    create type public.channel_type as enum ('email', 'sms');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'channel_status'
  ) then
    create type public.channel_status as enum ('active', 'disabled', 'error');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'conversation_status'
  ) then
    create type public.conversation_status as enum (
      'open',
      'closed',
      'waiting_on_customer',
      'waiting_on_internal'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'risk_level'
  ) then
    create type public.risk_level as enum ('green', 'yellow', 'red');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'sender_type'
  ) then
    create type public.sender_type as enum ('customer', 'agent', 'system', 'ai');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'message_direction'
  ) then
    create type public.message_direction as enum ('inbound', 'outbound', 'internal');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Automatically refreshes updated_at on mutable rows.';


-- ════════════════════════════════
-- 0002_organizations_and_users.sql
-- ════════════════════════════════
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  crm_plan text not null default 'starter',
  ai_plan text not null default 'starter',
  website_domain text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_unique unique (slug)
);

create index if not exists organizations_slug_idx
  on public.organizations (slug);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email citext not null,
  role public.user_role not null,
  status public.user_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_auth_user_id_unique unique (auth_user_id),
  constraint users_org_id_email_unique unique (org_id, email)
);

create index if not exists users_org_role_idx
  on public.users (org_id, role);

create index if not exists users_org_status_idx
  on public.users (org_id, status);

create index if not exists users_org_email_idx
  on public.users (org_id, email);

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

comment on table public.organizations is
  'Top-level tenant record for each Work Hat customer organization.';

comment on column public.organizations.website_domain is
  'Primary customer website or brand domain, useful for workspace setup and future email alignment.';

comment on table public.users is
  'Application users scoped to an organization and linked to Supabase auth identities.';


-- ════════════════════════════════
-- 0003_companies_contacts_channels.sql
-- ════════════════════════════════
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  industry text null,
  notes text null,
  tags jsonb not null default '[]'::jsonb,
  active_contacts integer not null default 0,
  open_conversations integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_org_name_idx
  on public.companies (org_id, name);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  first_name text null,
  last_name text null,
  full_name text not null default '',
  email citext null,
  phone text null,
  notes text null,
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  tier text null,
  preferred_channel text null,
  location text null,
  lifecycle_stage text null,
  last_activity_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_org_company_idx
  on public.contacts (org_id, company_id);

create index if not exists contacts_org_email_idx
  on public.contacts (org_id, email)
  where email is not null;

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type public.channel_type not null,
  provider text not null default 'postmark',
  status public.channel_status not null default 'active',
  inbound_address text null,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists channels_org_type_status_idx
  on public.channels (org_id, type, status);

create unique index if not exists channels_inbound_address_unique_idx
  on public.channels (inbound_address)
  where inbound_address is not null;

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists set_contacts_updated_at on public.contacts;
create trigger set_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists set_channels_updated_at on public.channels;
create trigger set_channels_updated_at
before update on public.channels
for each row execute function public.set_updated_at();


-- ════════════════════════════════
-- 0004_enrich_companies_contacts_channels.sql
-- ════════════════════════════════
-- Migration 0004: Enrich companies, contacts, channels
-- Uses ADD COLUMN IF NOT EXISTS throughout so it's safe to run
-- even if 0003 already included these columns.

alter table public.companies
  add column if not exists domain text null,
  add column if not exists account_owner_user_id uuid null references public.users(id) on delete set null,
  add column if not exists tier text not null default 'standard',
  add column if not exists health_score integer not null default 100 check (health_score between 0 and 100),
  add column if not exists arr numeric(12,2) null;

create index if not exists companies_org_owner_idx
  on public.companies (org_id, account_owner_user_id);

alter table public.contacts
  add column if not exists owner_user_id uuid null references public.users(id) on delete set null;

create index if not exists contacts_org_owner_idx
  on public.contacts (org_id, owner_user_id);

create index if not exists contacts_org_last_activity_idx
  on public.contacts (org_id, last_activity_at desc);


-- ════════════════════════════════
-- 0005_conversations_and_messages.sql
-- ════════════════════════════════
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid null references public.contacts(id) on delete set null,
  company_id uuid null references public.companies(id) on delete set null,
  channel_id uuid not null references public.channels(id) on delete restrict,
  subject text null,
  status public.conversation_status not null default 'open',
  priority text not null default 'normal',
  assigned_user_id uuid null references public.users(id) on delete set null,
  risk_level public.risk_level not null default 'green',
  ai_confidence public.risk_level not null default 'green',
  sentiment_customer public.risk_level not null default 'green',
  sentiment_agent public.risk_level not null default 'green',
  tags jsonb not null default '[]'::jsonb,
  external_thread_id text null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_org_status_last_message_idx
  on public.conversations (org_id, status, last_message_at desc);

create index if not exists conversations_org_assigned_last_message_idx
  on public.conversations (org_id, assigned_user_id, last_message_at desc);

create index if not exists conversations_org_contact_last_message_idx
  on public.conversations (org_id, contact_id, last_message_at desc);

create index if not exists conversations_org_company_last_message_idx
  on public.conversations (org_id, company_id, last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type public.sender_type not null,
  sender_user_id uuid null references public.users(id) on delete set null,
  direction public.message_direction not null,
  channel_message_id text null,
  author_name text not null,
  subject text null,
  body_text text not null,
  body_html text null,
  is_note boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint messages_agent_requires_user check (
    sender_type <> 'agent' or sender_user_id is not null
  )
);

create index if not exists messages_org_conversation_created_idx
  on public.messages (org_id, conversation_id, created_at);

create unique index if not exists messages_org_channel_message_unique_idx
  on public.messages (org_id, channel_message_id)
  where channel_message_id is not null;

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at();

comment on table public.conversations is
  'Conversation threads spanning customer, agent, AI, and internal support activity.';

comment on table public.messages is
  'Normalized message records for inbound, outbound, AI, and internal note traffic.';


-- ════════════════════════════════
-- 0006_ai_drafts_sent_replies_edit_analyses.sql
-- ════════════════════════════════
create table if not exists public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid null references public.messages(id) on delete set null,
  generated_by_user_id uuid not null references public.users(id) on delete restrict,
  draft_text text not null,
  rationale text not null default '',
  confidence_level public.risk_level not null default 'yellow',
  risk_flags jsonb not null default '[]'::jsonb,
  missing_context jsonb not null default '[]'::jsonb,
  recommended_tags jsonb not null default '[]'::jsonb,
  provider text not null default 'openai',
  model text not null default 'gpt-5.4-mini',
  prompt_version text not null,
  request_tokens integer null,
  response_tokens integer null,
  latency_ms integer null,
  created_at timestamptz not null default now()
);

create index if not exists ai_drafts_org_conversation_created_idx
  on public.ai_drafts (org_id, conversation_id, created_at desc);

create index if not exists ai_drafts_org_generated_by_created_idx
  on public.ai_drafts (org_id, generated_by_user_id, created_at desc);

create index if not exists ai_drafts_org_prompt_version_idx
  on public.ai_drafts (org_id, prompt_version);

create table if not exists public.sent_replies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_ai_draft_id uuid null references public.ai_drafts(id) on delete set null,
  sent_by_user_id uuid not null references public.users(id) on delete restrict,
  message_id uuid not null references public.messages(id) on delete restrict,
  body_text text not null,
  sent_at timestamptz not null default now(),
  constraint sent_replies_message_id_unique unique (message_id)
);

create index if not exists sent_replies_org_conversation_sent_at_idx
  on public.sent_replies (org_id, conversation_id, sent_at desc);

create index if not exists sent_replies_org_sent_by_sent_at_idx
  on public.sent_replies (org_id, sent_by_user_id, sent_at desc);

create table if not exists public.edit_analyses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  ai_draft_id uuid not null references public.ai_drafts(id) on delete restrict,
  sent_reply_id uuid not null references public.sent_replies(id) on delete restrict,
  edit_distance_score numeric(8,4) not null,
  change_percent numeric(8,4) not null,
  categories jsonb not null default '[]'::jsonb,
  likely_reason_summary text not null default '',
  classification_confidence numeric(5,4) null,
  raw_diff_json jsonb not null default '{}'::jsonb,
  raw_analysis_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint edit_analyses_sent_reply_unique unique (sent_reply_id)
);

create index if not exists edit_analyses_org_conversation_created_idx
  on public.edit_analyses (org_id, conversation_id, created_at desc);

create index if not exists edit_analyses_org_created_idx
  on public.edit_analyses (org_id, created_at desc);

comment on table public.ai_drafts is
  'Stored AI-generated draft replies and their generation metadata for auditability and analysis.';

comment on table public.sent_replies is
  'Human-approved outbound replies linked back to messages and optional AI drafts.';

comment on table public.edit_analyses is
  'Deterministic diff plus classifier output used to measure AI improvement over time.';


-- ════════════════════════════════
-- 0007_knowledge_entries_and_chunks.sql
-- ════════════════════════════════
-- Migration 0007: Knowledge entries and retrieval chunks
-- Schema aligned with application queries.ts and knowledge API routes.

create table if not exists public.knowledge_entries (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  title        text not null,
  summary      text not null default '',
  body         text not null default '',
  category     text not null default 'sop',
  tags         jsonb not null default '[]'::jsonb,
  used_in_drafts integer not null default 0,
  last_updated date not null default current_date,
  updated_by   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists knowledge_entries_org_category_idx
  on public.knowledge_entries (org_id, category);

create index if not exists knowledge_entries_org_used_drafts_idx
  on public.knowledge_entries (org_id, used_in_drafts desc);

create table if not exists public.knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  entry_id    uuid not null references public.knowledge_entries(id) on delete cascade,
  chunk_index integer not null,
  text        text not null,
  content_tsv tsvector generated always as (to_tsvector('english', text)) stored,
  created_at  timestamptz not null default now(),
  constraint knowledge_chunks_entry_chunk_unique unique (entry_id, chunk_index)
);

create index if not exists knowledge_chunks_org_entry_chunk_idx
  on public.knowledge_chunks (org_id, entry_id, chunk_index);

create index if not exists knowledge_chunks_content_tsv_idx
  on public.knowledge_chunks using gin (content_tsv);

drop trigger if exists set_knowledge_entries_updated_at on public.knowledge_entries;
create trigger set_knowledge_entries_updated_at
before update on public.knowledge_entries
for each row
execute function public.set_updated_at();

comment on table public.knowledge_entries is
  'SOPs, policies, tone guides, and product context fed into AI draft generation.';

comment on table public.knowledge_chunks is
  'Chunked retrieval units. Full-text indexed via content_tsv; embedding column added in 0012.';


-- ════════════════════════════════
-- 0008_qa_usage_billing.sql
-- ════════════════════════════════
create table if not exists public.qa_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  edit_analysis_id uuid null references public.edit_analyses(id) on delete set null,
  reviewer_user_id uuid not null references public.users(id) on delete restrict,
  score numeric(5,2) null,
  result text null,
  categories jsonb not null default '[]'::jsonb,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists qa_reviews_org_reviewer_created_idx
  on public.qa_reviews (org_id, reviewer_user_id, created_at desc);

create index if not exists qa_reviews_org_conversation_created_idx
  on public.qa_reviews (org_id, conversation_id, created_at desc);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid null references public.users(id) on delete set null,
  event_type text not null,
  units integer not null default 1,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_org_event_created_idx
  on public.usage_events (org_id, event_type, created_at desc);

create index if not exists usage_events_org_user_created_idx
  on public.usage_events (org_id, user_id, created_at desc);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_customer_id text not null,
  provider_subscription_id text null,
  crm_plan text not null default 'starter',
  ai_plan text not null default 'starter',
  seat_count integer not null default 1,
  status text not null default 'trialing',
  renewal_date timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_org_unique unique (org_id)
);

create index if not exists billing_subscriptions_customer_idx
  on public.billing_subscriptions (provider_customer_id);

create index if not exists billing_subscriptions_status_renewal_idx
  on public.billing_subscriptions (status, renewal_date);

drop trigger if exists set_billing_subscriptions_updated_at on public.billing_subscriptions;
create trigger set_billing_subscriptions_updated_at
before update on public.billing_subscriptions
for each row
execute function public.set_updated_at();

comment on table public.qa_reviews is
  'Optional QA scoring and coaching records layered onto edit analyses and conversations.';

comment on table public.usage_events is
  'Metered product and AI activity used for reporting, plan enforcement, and billing.';

comment on table public.billing_subscriptions is
  'Org-level billing state and external provider identifiers for Work Hat plans.';


-- ════════════════════════════════
-- 0009_auth_helpers_and_rls.sql
-- ════════════════════════════════
create or replace function public.current_org_id()
returns uuid
language sql
stable
as $$
  select u.org_id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select u.role::text
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.current_user_can_manage_settings()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_user_role() in ('admin', 'manager'), false)
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  email_local text;
  org_slug text;
begin
  email_local := split_part(coalesce(new.email, 'workspace'), '@', 1);
  org_slug := lower(regexp_replace(email_local, '[^a-zA-Z0-9]+', '-', 'g'));

  insert into public.organizations (name, slug)
  values (
    coalesce(
      new.raw_user_meta_data->>'organization_name',
      initcap(replace(email_local, '.', ' ')) || ' Workspace'
    ),
    org_slug || '-' || substr(replace(new.id::text, '-', ''), 1, 8)
  )
  returning id into new_org_id;

  insert into public.users (org_id, auth_user_id, full_name, email, role, status)
  values (
    new_org_id,
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', email_local),
    new.email,
    'admin',
    'active'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.channels enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ai_drafts enable row level security;
alter table public.sent_replies enable row level security;
alter table public.edit_analyses enable row level security;
alter table public.knowledge_entries enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.qa_reviews enable row level security;
alter table public.usage_events enable row level security;
alter table public.billing_subscriptions enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
for select to authenticated
using (id = public.current_org_id());

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations
for update to authenticated
using (
  id = public.current_org_id()
  and public.current_user_is_admin()
)
with check (
  id = public.current_org_id()
  and public.current_user_is_admin()
);

drop policy if exists users_select_org_access on public.users;
create policy users_select_org_access on public.users
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin on public.users
for insert to authenticated
with check (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
);

drop policy if exists users_update_admin on public.users;
create policy users_update_admin on public.users
for update to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
);

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users
for delete to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
);

drop policy if exists channels_select_org_access on public.channels;
create policy channels_select_org_access on public.channels
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists channels_manage_settings on public.channels;
create policy channels_manage_settings on public.channels
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
);

drop policy if exists companies_org_access on public.companies;
create policy companies_org_access on public.companies
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists contacts_org_access on public.contacts;
create policy contacts_org_access on public.contacts
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists conversations_org_access on public.conversations;
create policy conversations_org_access on public.conversations
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists messages_org_access on public.messages;
create policy messages_org_access on public.messages
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists ai_drafts_org_access on public.ai_drafts;
create policy ai_drafts_org_access on public.ai_drafts
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists sent_replies_org_access on public.sent_replies;
create policy sent_replies_org_access on public.sent_replies
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists edit_analyses_org_access on public.edit_analyses;
create policy edit_analyses_org_access on public.edit_analyses
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists knowledge_entries_select_org_access on public.knowledge_entries;
create policy knowledge_entries_select_org_access on public.knowledge_entries
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists knowledge_entries_manage_settings on public.knowledge_entries;
create policy knowledge_entries_manage_settings on public.knowledge_entries
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
);

drop policy if exists knowledge_chunks_select_org_access on public.knowledge_chunks;
create policy knowledge_chunks_select_org_access on public.knowledge_chunks
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists knowledge_chunks_manage_settings on public.knowledge_chunks;
create policy knowledge_chunks_manage_settings on public.knowledge_chunks
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
);

drop policy if exists qa_reviews_org_access on public.qa_reviews;
create policy qa_reviews_org_access on public.qa_reviews
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists usage_events_org_access on public.usage_events;
create policy usage_events_org_access on public.usage_events
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists billing_subscriptions_select_org_access on public.billing_subscriptions;
create policy billing_subscriptions_select_org_access on public.billing_subscriptions
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists billing_subscriptions_manage_admin on public.billing_subscriptions;
create policy billing_subscriptions_manage_admin on public.billing_subscriptions
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
);


-- ════════════════════════════════
-- 0010_stripe_billing.sql
-- ════════════════════════════════
-- Migration 0010: Add Stripe billing fields to organizations
-- Run in Supabase SQL editor or via CLI

alter table public.organizations
  add column if not exists stripe_customer_id    text null,
  add column if not exists stripe_subscription_id text null,
  add column if not exists plan_status            text not null default 'free';

-- crm_plan already exists (starter/pro/scale), we reuse it.
-- plan_status tracks: free | trialing | active | past_due | canceled

comment on column public.organizations.stripe_customer_id is
  'Stripe customer ID (cus_xxx), set on first checkout.';

comment on column public.organizations.stripe_subscription_id is
  'Active Stripe subscription ID (sub_xxx).';

comment on column public.organizations.plan_status is
  'Billing lifecycle: free | trialing | active | past_due | canceled.';


-- ════════════════════════════════
-- 0011_waitlist_signups.sql
-- ════════════════════════════════
-- Migration 0011: Waitlist signups table
-- Run in Supabase SQL editor

create table if not exists public.waitlist_signups (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null,
  role        text null,
  source      text null,
  ip_address  text null,
  status      text not null default 'pending',  -- pending | approved | rejected
  approved_at timestamptz null,
  created_at  timestamptz not null default now(),
  constraint waitlist_signups_email_unique unique (email)
);

create index if not exists waitlist_signups_status_idx
  on public.waitlist_signups (status, created_at desc);

comment on table public.waitlist_signups is
  'Waitlist signups from the work-hat.com landing page.';

comment on column public.waitlist_signups.status is
  'pending = not yet reviewed, approved = granted access, rejected = declined.';


-- ════════════════════════════════
-- 0012_pgvector_embeddings.sql
-- ════════════════════════════════
-- Migration 0012: pgvector extension + embedding column on knowledge_chunks
-- Run AFTER 0007.
-- Enables semantic search for AI draft knowledge retrieval.

-- Enable pgvector (requires Supabase project to have the extension available)
create extension if not exists vector;

-- Add embedding column (1536 dims = text-embedding-3-small)
alter table public.knowledge_chunks
  add column if not exists embedding vector(1536) null;

-- IVFFlat index for approximate nearest-neighbor search
-- Build after you have at least ~100 rows for best performance
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RPC function for semantic chunk search, scoped to an org
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  p_org_id        uuid,
  match_count     int default 4,
  min_similarity  float default 0.5
)
returns table (
  id          uuid,
  entry_id    uuid,
  chunk_index int,
  text        text,
  similarity  float
)
language sql stable
as $$
  select
    kc.id,
    kc.entry_id,
    kc.chunk_index,
    kc.text,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.org_id = p_org_id
    and kc.embedding is not null
    and 1 - (kc.embedding <=> query_embedding) >= min_similarity
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.match_knowledge_chunks is
  'Returns the top-k knowledge chunks most similar to a query embedding, scoped to an org.';


