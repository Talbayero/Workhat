-- Buyer-friendly mailbox connection methods.
-- Gmail remains the production OAuth adapter; credential-based methods are saved
-- as encrypted setup records so sync adapters can attach without a schema break.

alter table public.email_connections
  drop constraint if exists email_connections_provider_check;

alter table public.email_connections
  add constraint email_connections_provider_check
  check (
    provider in (
      'gmail',
      'outlook',
      'custom_inbound',
      'mailbox_password',
      'app_password',
      'imap_smtp'
    )
  );

comment on column public.email_connections.provider is
  'Mailbox provider or connection method. OAuth providers include gmail/outlook; credential setup methods include mailbox_password, app_password, and imap_smtp; custom_inbound is reserved for developer webhook channels.';

comment on column public.email_connections.provider_metadata is
  'Provider-specific non-secret metadata such as connection method, hostnames, ports, TLS flags, sender name, adapter status, and audit-friendly setup timestamps. Plaintext credentials must never be stored here.';
