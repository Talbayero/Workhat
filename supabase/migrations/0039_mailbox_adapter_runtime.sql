-- Migration 0039 — Live mailbox adapter runtime state.
--
-- Adds explicit operational fields for mailbox adapters. Provider and
-- connection_type remain separate: provider is the mailbox family, while
-- connection_type is the setup/auth method.

alter table public.email_connections
  add column if not exists inbound_enabled boolean not null default true,
  add column if not exists outbound_enabled boolean not null default true,
  add column if not exists last_validated_at timestamptz null,
  add column if not exists last_inbound_sync_at timestamptz null,
  add column if not exists last_outbound_send_at timestamptz null,
  add column if not exists last_error_code text null,
  add column if not exists last_error_message text null,
  add column if not exists diagnostics_json jsonb not null default '{}'::jsonb,
  add column if not exists credential_metadata jsonb not null default '{}'::jsonb;

update public.email_connections
set status = case status
  when 'connected' then 'active'
  when 'needs_reconnect' then 'configured'
  when 'disabled' then 'disconnected'
  else status
end
where status in ('connected', 'needs_reconnect', 'disabled');

update public.email_connections
set
  last_error_message = coalesce(last_error_message, error_message),
  diagnostics_json = case
    when diagnostics_json = '{}'::jsonb and error_message is not null
      then jsonb_build_object('last_message', error_message)
    else diagnostics_json
  end
where error_message is not null;

alter table public.email_connections
  drop constraint if exists email_connections_status_check;

alter table public.email_connections
  add constraint email_connections_status_check
  check (status in ('configured', 'validating', 'active', 'error', 'disconnected'));

create index if not exists email_connections_org_runtime_status_idx
  on public.email_connections (org_id, status, inbound_enabled, outbound_enabled);

create index if not exists email_connections_org_sync_due_idx
  on public.email_connections (org_id, last_inbound_sync_at)
  where status = 'active' and inbound_enabled = true;

comment on column public.email_connections.inbound_enabled is
  'Whether this connection is allowed to ingest inbound mail.';

comment on column public.email_connections.outbound_enabled is
  'Whether this connection is allowed to send approved outbound replies.';

comment on column public.email_connections.last_validated_at is
  'Last time Work Hat successfully validated provider credentials and transport settings.';

comment on column public.email_connections.last_inbound_sync_at is
  'Last successful inbound polling/import timestamp for mailbox adapters.';

comment on column public.email_connections.last_outbound_send_at is
  'Last successful outbound provider send timestamp.';

comment on column public.email_connections.last_error_code is
  'Stable operator-facing error code from the mailbox adapter.';

comment on column public.email_connections.last_error_message is
  'Latest sanitized operator-facing error message from the mailbox adapter.';

comment on column public.email_connections.diagnostics_json is
  'Non-secret adapter diagnostics such as host reachability, last validation, last poll, and recommended next action.';

comment on column public.email_connections.credential_metadata is
  'Non-secret credential metadata such as username and auth mechanism. Plaintext secrets must never be stored here.';
