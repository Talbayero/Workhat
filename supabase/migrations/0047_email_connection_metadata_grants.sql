-- Allow authenticated users to read non-secret email connection metadata only.
--
-- The table stores encrypted provider tokens, so we intentionally do not grant
-- table-wide SELECT to authenticated. Column-level grants let settings/readiness
-- checks inspect connection state while keeping token ciphertext server-only.
--
-- Tenant isolation is still enforced by email_connections_select_org_access:
--   org_id = public.current_org_id()

revoke select on public.email_connections from authenticated;

grant select (
  id,
  org_id,
  created_by_user_id,
  provider,
  provider_account_email,
  display_name,
  status,
  sync_status,
  token_expires_at,
  scopes,
  watch_expires_at,
  last_sync_at,
  error_message,
  provider_metadata,
  created_at,
  updated_at,
  connection_type,
  inbound_enabled,
  outbound_enabled,
  last_validated_at,
  last_inbound_sync_at,
  last_outbound_send_at,
  last_error_code,
  last_error_message
) on public.email_connections to authenticated;

comment on table public.email_connections is
  'Org-scoped mailbox connection table. Authenticated users may read conservative non-secret metadata columns only; token ciphertext, diagnostics_json, and credential_metadata remain server-only by default.';
