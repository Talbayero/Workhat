-- Migration 0040 — Repair email_connections normalization and lifecycle/runtime split.
--
-- This migration is intentionally defensive. Some environments may be partway
-- between the legacy 0015 model and the newer 0038/0039 model, or may have
-- partially normalized rows from manual SQL. The goal is to:
-- 1. ensure required columns exist,
-- 2. normalize provider, connection_type, status, and sync_status safely,
-- 3. backfill runtime fields,
-- 4. dedupe normalized rows,
-- 5. apply the final constraints only after normalization.

alter table public.email_connections
  add column if not exists connection_type text null,
  add column if not exists inbound_enabled boolean not null default true,
  add column if not exists outbound_enabled boolean not null default true,
  add column if not exists last_validated_at timestamptz null,
  add column if not exists last_inbound_sync_at timestamptz null,
  add column if not exists last_outbound_send_at timestamptz null,
  add column if not exists last_error_code text null,
  add column if not exists last_error_message text null,
  add column if not exists diagnostics_json jsonb not null default '{}'::jsonb,
  add column if not exists credential_metadata jsonb not null default '{}'::jsonb;

alter table public.email_connections
  drop constraint if exists email_connections_provider_check;

alter table public.email_connections
  drop constraint if exists email_connections_connection_type_check;

alter table public.email_connections
  drop constraint if exists email_connections_status_check;

alter table public.email_connections
  drop constraint if exists email_connections_sync_status_check;

alter table public.email_connections
  drop constraint if exists email_connections_org_id_provider_provider_account_email_key;

alter table public.email_connections
  drop constraint if exists email_connections_org_provider_account_type_key;

with normalized_connection_type as (
  select
    id,
    case
      when lower(trim(coalesce(connection_type, ''))) in ('oauth', 'mailbox_password', 'app_password', 'imap_smtp', 'custom_inbound')
        then lower(trim(connection_type))
      when lower(trim(coalesce(provider, ''))) in ('mailbox_password', 'mailboxpassword', 'basicpassword')
        then 'mailbox_password'
      when lower(trim(coalesce(provider, ''))) in ('app_password', 'apppassword')
        then 'app_password'
      when lower(trim(coalesce(provider, ''))) in ('imap_smtp', 'imapsmtp', 'imap/smtp', 'imap-smtp')
        then 'imap_smtp'
      when lower(trim(coalesce(provider, ''))) = 'custom_inbound'
        then 'custom_inbound'
      when lower(trim(coalesce(provider_metadata->>'connection_type', ''))) in ('oauth', 'mailbox_password', 'app_password', 'imap_smtp', 'custom_inbound')
        then lower(trim(provider_metadata->>'connection_type'))
      when lower(trim(coalesce(provider_metadata->>'credential_type', ''))) = 'app_password'
        then 'app_password'
      when lower(trim(coalesce(provider_metadata->>'credential_type', ''))) in ('mailbox_password', 'password')
        then 'mailbox_password'
      else 'oauth'
    end as normalized_value
  from public.email_connections
)
update public.email_connections ec
set connection_type = n.normalized_value
from normalized_connection_type n
where ec.id = n.id
  and ec.connection_type is distinct from n.normalized_value;

with normalized_provider as (
  select
    id,
    case
      when connection_type = 'custom_inbound' or lower(trim(coalesce(provider, ''))) = 'custom_inbound'
        then 'custom_inbound'
      when lower(trim(coalesce(provider, ''))) in ('gmail', 'google', 'googleworkspace', 'google_workspace', 'googlemail')
        or lower(trim(coalesce(provider_metadata->>'provider', ''))) in ('gmail', 'google', 'googleworkspace', 'google_workspace', 'googlemail')
        or lower(trim(coalesce(provider_metadata->>'provider_hint', ''))) in ('gmail', 'google', 'googleworkspace', 'google_workspace', 'googlemail')
        or split_part(lower(coalesce(provider_account_email, '')), '@', 2) in ('gmail.com', 'googlemail.com')
        then 'gmail'
      when lower(trim(coalesce(provider, ''))) in ('microsoft365', 'microsoft_365', 'office365', 'office_365', 'm365')
        or lower(trim(coalesce(provider_metadata->>'provider', ''))) in ('microsoft365', 'microsoft_365', 'office365', 'office_365', 'm365')
        or lower(trim(coalesce(provider_metadata->>'provider_hint', ''))) in ('microsoft365', 'microsoft_365', 'office365', 'office_365', 'm365')
        then 'microsoft365'
      when lower(trim(coalesce(provider, ''))) in ('outlook', 'hotmail', 'live')
        or lower(trim(coalesce(provider_metadata->>'provider', ''))) in ('outlook', 'hotmail', 'live')
        or lower(trim(coalesce(provider_metadata->>'provider_hint', ''))) in ('outlook', 'hotmail', 'live')
        or split_part(lower(coalesce(provider_account_email, '')), '@', 2) in ('outlook.com', 'hotmail.com', 'live.com')
        then 'outlook'
      when lower(trim(coalesce(provider, ''))) = 'exchange'
        or lower(trim(coalesce(provider_metadata->>'provider', ''))) = 'exchange'
        or lower(trim(coalesce(provider_metadata->>'provider_hint', ''))) = 'exchange'
        or lower(concat_ws(' ',
          coalesce(provider_metadata->>'imapHost', ''),
          coalesce(provider_metadata->>'smtpHost', ''),
          coalesce(provider_metadata->'imap'->>'host', ''),
          coalesce(provider_metadata->'smtp'->>'host', '')
        )) like '%exchange%'
        then 'exchange'
      when lower(trim(coalesce(provider, ''))) = 'zoho'
        or lower(trim(coalesce(provider_metadata->>'provider', ''))) = 'zoho'
        or lower(trim(coalesce(provider_metadata->>'provider_hint', ''))) = 'zoho'
        or split_part(lower(coalesce(provider_account_email, '')), '@', 2) like '%zoho.%'
        or lower(concat_ws(' ',
          coalesce(provider_metadata->>'imapHost', ''),
          coalesce(provider_metadata->>'smtpHost', ''),
          coalesce(provider_metadata->'imap'->>'host', ''),
          coalesce(provider_metadata->'smtp'->>'host', '')
        )) like '%zoho.%'
        then 'zoho'
      when lower(trim(coalesce(provider, ''))) in ('icloud', 'apple')
        or lower(trim(coalesce(provider_metadata->>'provider', ''))) in ('icloud', 'apple')
        or lower(trim(coalesce(provider_metadata->>'provider_hint', ''))) in ('icloud', 'apple')
        or split_part(lower(coalesce(provider_account_email, '')), '@', 2) in ('icloud.com', 'me.com', 'mac.com')
        then 'icloud'
      when lower(trim(coalesce(provider, ''))) in ('custom', 'mailbox_password', 'app_password', 'imap_smtp', 'imapsmtp', 'imap/smtp', 'imap-smtp', 'oauth', 'xoauth', 'xoauth')
        then 'custom'
      when lower(trim(coalesce(provider, ''))) in ('gmail', 'microsoft365', 'outlook', 'exchange', 'zoho', 'icloud', 'custom', 'custom_inbound')
        then lower(trim(provider))
      else 'custom'
    end as normalized_value
  from public.email_connections
)
update public.email_connections ec
set provider = n.normalized_value
from normalized_provider n
where ec.id = n.id
  and ec.provider is distinct from n.normalized_value;

update public.email_connections
set sync_status = case
  when lower(trim(coalesce(sync_status, ''))) in ('idle', 'syncing', 'watching', 'error')
    then lower(trim(sync_status))
  when lower(trim(coalesce(status, ''))) in ('idle', 'syncing', 'watching', 'error')
    then lower(trim(status))
  when lower(trim(coalesce(status, ''))) = 'active' and watch_expires_at is not null
    then 'watching'
  when lower(trim(coalesce(status, ''))) = 'error'
    then 'error'
  else 'idle'
end
where sync_status is null
   or lower(trim(coalesce(sync_status, ''))) not in ('idle', 'syncing', 'watching', 'error');

update public.email_connections
set status = case
  when lower(trim(coalesce(status, ''))) = 'draft' then 'draft'
  when lower(trim(coalesce(status, ''))) in ('connected', 'active') then 'active'
  when lower(trim(coalesce(status, ''))) in ('needs_reconnect', 'configured', 'pending', 'new', 'idle', 'syncing', 'watching')
    then 'configured'
  when lower(trim(coalesce(status, ''))) in ('validating', 'checking')
    then 'validating'
  when lower(trim(coalesce(status, ''))) in ('disabled', 'disconnected')
    then 'disconnected'
  when lower(trim(coalesce(status, ''))) in ('error', 'failed')
    then 'error'
  else 'configured'
end;

update public.email_connections
set
  inbound_enabled = coalesce(inbound_enabled, true),
  outbound_enabled = coalesce(outbound_enabled, true),
  last_error_message = coalesce(last_error_message, error_message),
  diagnostics_json = case
    when diagnostics_json = '{}'::jsonb and error_message is not null
      then jsonb_build_object('last_message', error_message)
    else diagnostics_json
  end,
  last_inbound_sync_at = coalesce(last_inbound_sync_at, last_sync_at),
  last_validated_at = case
    when status = 'active' then coalesce(last_validated_at, last_sync_at, updated_at)
    else last_validated_at
  end;

with ranked as (
  select
    id,
    row_number() over (
      partition by org_id, provider, provider_account_email, connection_type
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.email_connections
)
delete from public.email_connections ec
using ranked r
where ec.id = r.id
  and r.rn > 1;

alter table public.email_connections
  alter column connection_type set default 'oauth';

alter table public.email_connections
  alter column connection_type set not null;

alter table public.email_connections
  alter column status set default 'draft';

alter table public.email_connections
  alter column sync_status set default 'idle';

alter table public.email_connections
  add constraint email_connections_connection_type_check
  check (connection_type in ('oauth', 'mailbox_password', 'app_password', 'imap_smtp', 'custom_inbound'));

alter table public.email_connections
  add constraint email_connections_provider_check
  check (
    provider in (
      'gmail',
      'microsoft365',
      'outlook',
      'exchange',
      'zoho',
      'icloud',
      'custom',
      'custom_inbound'
    )
  );

alter table public.email_connections
  add constraint email_connections_status_check
  check (status in ('draft', 'configured', 'validating', 'active', 'error', 'disconnected'));

alter table public.email_connections
  add constraint email_connections_sync_status_check
  check (sync_status in ('idle', 'syncing', 'watching', 'error'));

alter table public.email_connections
  add constraint email_connections_org_provider_account_type_key
  unique (org_id, provider, provider_account_email, connection_type);

create index if not exists email_connections_org_connection_type_idx
  on public.email_connections (org_id, connection_type, status);

create index if not exists email_connections_org_runtime_status_idx
  on public.email_connections (org_id, status, inbound_enabled, outbound_enabled);

create index if not exists email_connections_org_sync_due_idx
  on public.email_connections (org_id, last_inbound_sync_at)
  where status = 'active' and inbound_enabled = true;

comment on column public.email_connections.status is
  'Lifecycle state for mailbox setup and activation: draft, configured, validating, active, error, or disconnected.';

comment on column public.email_connections.sync_status is
  'Runtime sync state kept separate from lifecycle status: idle, syncing, watching, or error.';
