-- Migration 0036 — Custom inbound email channels and delivery diagnostics
--
-- Adds first-class non-Gmail inbound channel support. Gmail remains supported
-- through email_connections; custom inbound channels use channels.config_json
-- for encrypted webhook token metadata and inbound_email_events for idempotency
-- and operator diagnostics.

alter table public.email_connections
  drop constraint if exists email_connections_provider_check;

alter table public.email_connections
  add constraint email_connections_provider_check
  check (provider in ('gmail', 'outlook', 'custom_inbound'));

create table if not exists public.inbound_email_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  provider text not null,
  external_message_id text not null,
  external_thread_id text null,
  dedupe_key text not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'duplicate', 'skipped', 'error')),
  conversation_id uuid null references public.conversations(id) on delete set null,
  message_id uuid null references public.messages(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  error_message text null,
  payload_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbound_email_events_dedupe_unique unique (org_id, dedupe_key),
  constraint inbound_email_events_provider_message_unique unique (org_id, provider, external_message_id)
);

create index if not exists inbound_email_events_org_received_idx
  on public.inbound_email_events (org_id, received_at desc);

create index if not exists inbound_email_events_channel_received_idx
  on public.inbound_email_events (channel_id, received_at desc);

create index if not exists inbound_email_events_status_idx
  on public.inbound_email_events (org_id, status, received_at desc);

create index if not exists channels_org_provider_idx
  on public.channels (org_id, provider, status);

drop trigger if exists set_inbound_email_events_updated_at on public.inbound_email_events;
create trigger set_inbound_email_events_updated_at
before update on public.inbound_email_events
for each row execute function public.set_updated_at();

alter table public.inbound_email_events enable row level security;

drop policy if exists inbound_email_events_service_all on public.inbound_email_events;
create policy inbound_email_events_service_all
on public.inbound_email_events
for all
to service_role
using (true)
with check (true);

drop policy if exists inbound_email_events_org_select on public.inbound_email_events;
create policy inbound_email_events_org_select
on public.inbound_email_events
for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.current_user_has_capability('integrations.manage')
    or public.current_user_has_capability('settings.manage')
  )
);

comment on table public.inbound_email_events is
  'Provider-neutral inbound email delivery log used for webhook idempotency and channel diagnostics.';

comment on column public.inbound_email_events.dedupe_key is
  'Stable provider/channel/message key. Repeated webhook deliveries must map to the same value.';
