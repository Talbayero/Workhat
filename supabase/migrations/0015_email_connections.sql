-- Migration 0015: Work Hat Email Connector foundation.
--
-- Stores provider mailbox connections for direct Gmail/Outlook sync. Tokens are
-- encrypted by the application before being written to these columns.

create table if not exists public.email_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid null references public.users(id) on delete set null,
  provider text not null check (provider in ('gmail', 'outlook')),
  provider_account_email citext not null,
  display_name text null,
  status text not null default 'connected'
    check (status in ('connected', 'needs_reconnect', 'disabled', 'error')),
  sync_status text not null default 'idle'
    check (sync_status in ('idle', 'syncing', 'watching', 'error')),
  access_token_ciphertext text null,
  refresh_token_ciphertext text null,
  token_expires_at timestamptz null,
  scopes text[] not null default '{}'::text[],
  last_history_id text null,
  watch_expires_at timestamptz null,
  last_sync_at timestamptz null,
  error_message text null,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, provider_account_email)
);

create index if not exists email_connections_org_provider_idx
  on public.email_connections (org_id, provider, status);

create index if not exists email_connections_sync_status_idx
  on public.email_connections (sync_status, updated_at desc);

drop trigger if exists set_email_connections_updated_at on public.email_connections;
create trigger set_email_connections_updated_at
before update on public.email_connections
for each row execute function public.set_updated_at();

alter table public.email_connections enable row level security;

drop policy if exists email_connections_select_org_access on public.email_connections;
create policy email_connections_select_org_access on public.email_connections
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists email_connections_manage_settings on public.email_connections;
create policy email_connections_manage_settings on public.email_connections
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
);

grant all privileges on public.email_connections to service_role;
