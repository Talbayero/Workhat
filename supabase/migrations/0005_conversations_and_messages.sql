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
  assigned_to_name text not null default '',   -- denormalized for fast display
  risk_level public.risk_level not null default 'green',
  ai_confidence public.risk_level not null default 'yellow',
  tags jsonb not null default '[]'::jsonb,
  preview text not null default '',             -- first 160 chars of latest inbound message
  intent text not null default 'general',       -- classified: billing|support|escalation|…
  external_thread_id text null,                 -- email Message-ID for threading
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

create index if not exists conversations_org_risk_last_message_idx
  on public.conversations (org_id, risk_level, last_message_at desc);

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
