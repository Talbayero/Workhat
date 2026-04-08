-- ============================================================
-- Work Hat CRM — Initial Schema  (single-tenant V1)
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── Profiles ────────────────────────────────────────────────
-- One row per auth user. Created automatically via trigger.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  role        text not null default 'agent'
                check (role in ('agent', 'admin', 'viewer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create profile when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Companies ───────────────────────────────────────────────
create table if not exists public.companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  domain              text,
  industry            text not null default '',
  account_owner       text not null default '',
  tier                text not null default 'standard'
                        check (tier in ('priority', 'watch', 'standard')),
  health_score        integer default 100 check (health_score between 0 and 100),
  open_conversations  integer not null default 0,
  active_contacts     integer not null default 0,
  arr                 numeric(12,2),
  notes               text not null default '',
  tags                text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── Contacts ────────────────────────────────────────────────
create table if not exists public.contacts (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  first_name        text not null default '',
  last_name         text not null default '',
  email             text,
  phone             text not null default '',
  company_id        uuid references public.companies(id) on delete set null,
  status            text not null default 'active'
                      check (status in ('vip', 'active', 'watch', 'manual')),
  tier              text not null default '',
  notes             text not null default '',
  tags              text[] not null default '{}',
  preferred_channel text not null default 'Email',
  location          text not null default '',
  lifecycle_stage   text not null default '',
  last_activity_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Conversations ───────────────────────────────────────────
create table if not exists public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  subject             text not null,
  status              text not null default 'open'
                        check (status in (
                          'open',
                          'waiting_on_customer',
                          'waiting_on_internal',
                          'resolved',
                          'archived'
                        )),
  priority            text not null default 'normal'
                        check (priority in ('urgent', 'high', 'normal', 'low')),
  contact_id          uuid references public.contacts(id) on delete set null,
  company_id          uuid references public.companies(id) on delete set null,
  assigned_to         uuid references public.profiles(id) on delete set null,
  assigned_to_name    text not null default '',
  risk_level          text not null default 'green'
                        check (risk_level in ('green', 'yellow', 'red')),
  ai_confidence       text not null default 'green'
                        check (ai_confidence in ('green', 'yellow', 'red')),
  preview             text not null default '',
  intent              text not null default '',
  tags                text[] not null default '{}',
  last_message_at     timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── Messages ────────────────────────────────────────────────
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_type      text not null
                     check (sender_type in ('agent', 'customer', 'system', 'ai')),
  direction        text not null default 'inbound'
                     check (direction in ('inbound', 'outbound', 'internal')),
  author_id        uuid references public.profiles(id) on delete set null,
  author_name      text not null,
  body_text        text not null,
  is_note          boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ── Knowledge entries ───────────────────────────────────────
create table if not exists public.knowledge_entries (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  summary         text not null default '',
  body            text not null default '',
  category        text not null
                    check (category in ('policy','sop','tone','product','escalation')),
  tags            text[] not null default '{}',
  used_in_drafts  integer not null default 0,
  last_updated    date not null default current_date,
  updated_by      text not null default 'system',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Knowledge chunks ────────────────────────────────────────
create table if not exists public.knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.knowledge_entries(id) on delete cascade,
  chunk_index  integer not null,
  text         text not null,
  created_at   timestamptz not null default now(),
  unique (entry_id, chunk_index)
);

-- ── Indexes ─────────────────────────────────────────────────
create index if not exists idx_conversations_status        on public.conversations(status);
create index if not exists idx_conversations_assigned_to   on public.conversations(assigned_to);
create index if not exists idx_conversations_company_id    on public.conversations(company_id);
create index if not exists idx_conversations_contact_id    on public.conversations(contact_id);
create index if not exists idx_conversations_last_message  on public.conversations(last_message_at desc);
create index if not exists idx_messages_conversation_id    on public.messages(conversation_id);
create index if not exists idx_contacts_company_id         on public.contacts(company_id);
create index if not exists idx_knowledge_chunks_entry_id   on public.knowledge_chunks(entry_id);

-- ── Row Level Security ──────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.companies          enable row level security;
alter table public.contacts           enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.knowledge_entries  enable row level security;
alter table public.knowledge_chunks   enable row level security;

-- Authenticated users can read and write everything
-- (single-team internal tool — tighten per-role later)
do $$ begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='auth_all') then
    create policy auth_all on public.profiles for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='companies' and policyname='auth_all') then
    create policy auth_all on public.companies for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='contacts' and policyname='auth_all') then
    create policy auth_all on public.contacts for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='conversations' and policyname='auth_all') then
    create policy auth_all on public.conversations for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='messages' and policyname='auth_all') then
    create policy auth_all on public.messages for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='knowledge_entries' and policyname='auth_all') then
    create policy auth_all on public.knowledge_entries for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='knowledge_chunks' and policyname='auth_all') then
    create policy auth_all on public.knowledge_chunks for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ── updated_at trigger ──────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ declare t text; begin
  foreach t in array array[
    'profiles','companies','contacts','conversations','knowledge_entries'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute procedure public.set_updated_at()', t);
  end loop;
end $$;
