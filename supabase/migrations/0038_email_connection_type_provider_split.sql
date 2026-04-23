-- Split mailbox setup method from mailbox provider.
--
-- 0037 temporarily allowed setup method names in email_connections.provider.
-- This migration restores provider as the actual mail provider and adds
-- connection_type for OAuth/password/app-password/IMAP-SMTP setup choices.

alter table public.email_connections
  add column if not exists connection_type text null;

update public.email_connections
set connection_type = case
  when provider in ('mailbox_password', 'app_password', 'imap_smtp') then provider
  when provider = 'custom_inbound' then 'custom_inbound'
  else 'oauth'
end
where connection_type is null;

update public.email_connections
set provider = case
  when lower(coalesce(provider_metadata->>'provider_hint', '')) in ('gmail', 'google', 'google_workspace') then 'gmail'
  when lower(coalesce(provider_metadata->>'provider_hint', '')) in ('microsoft365', 'microsoft_365', 'office365', 'office_365', 'm365') then 'microsoft365'
  when lower(coalesce(provider_metadata->>'provider_hint', '')) in ('outlook', 'hotmail', 'live') then 'outlook'
  when lower(coalesce(provider_metadata->>'provider_hint', '')) = 'exchange' then 'exchange'
  when lower(coalesce(provider_metadata->>'provider_hint', '')) = 'zoho' then 'zoho'
  when lower(coalesce(provider_metadata->>'provider_hint', '')) in ('icloud', 'apple') then 'icloud'
  else 'custom'
end
where provider in ('mailbox_password', 'app_password', 'imap_smtp');

alter table public.email_connections
  alter column connection_type set not null;

alter table public.email_connections
  alter column connection_type set default 'oauth';

alter table public.email_connections
  drop constraint if exists email_connections_connection_type_check;

alter table public.email_connections
  add constraint email_connections_connection_type_check
  check (connection_type in ('oauth', 'mailbox_password', 'app_password', 'imap_smtp', 'custom_inbound'));

alter table public.email_connections
  drop constraint if exists email_connections_provider_check;

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
  drop constraint if exists email_connections_org_id_provider_provider_account_email_key;

alter table public.email_connections
  drop constraint if exists email_connections_org_provider_account_type_key;

alter table public.email_connections
  add constraint email_connections_org_provider_account_type_key
  unique (org_id, provider, provider_account_email, connection_type);

create index if not exists email_connections_org_connection_type_idx
  on public.email_connections (org_id, connection_type, status);

comment on column public.email_connections.provider is
  'Actual mailbox provider or adapter family, such as gmail, microsoft365, outlook, exchange, zoho, icloud, custom, or custom_inbound.';

comment on column public.email_connections.connection_type is
  'Mailbox setup/authentication type: oauth, mailbox_password, app_password, imap_smtp, or custom_inbound.';

comment on column public.email_connections.provider_metadata is
  'Provider-specific non-secret metadata such as provider hint, hostnames, ports, TLS flags, sender name, adapter status, and setup timestamps. Plaintext credentials must never be stored here.';
