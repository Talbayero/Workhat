-- ─────────────────────────────────────────────────────────────────────────────
-- 0027_audit_log.sql
--
-- Immutable audit log for all security-relevant events.
--
-- Design principles:
--   • Written exclusively by the service role (no user can insert/update/delete).
--   • Append-only: UPDATE and DELETE are prohibited for all roles including
--     service_role (enforced by a BEFORE trigger that raises an exception).
--   • No FK references to mutable tables — actor_id / resource_id are stored
--     as UUID text so records survive the deletion of the referenced row.
--   • old_values / new_values stored as JSONB for flexible querying.
--   • Indexed for common audit queries: by org, by actor, by action, by time.
--
-- Action enum covers:
--   Auth:           auth.login, auth.logout, auth.login_failed,
--                   auth.password_reset, auth.mfa_enrolled, auth.mfa_verified
--   User mgmt:      user.created, user.updated, user.role_changed,
--                   user.deactivated, user.deleted, user.invite_sent
--   Org settings:   org.settings_updated, org.name_changed
--   Data:           contact.created, contact.updated, contact.deleted,
--                   company.created, company.updated, company.deleted,
--                   knowledge.created, knowledge.updated, knowledge.deleted
--   Conversations:  conversation.resolved, conversation.archived,
--                   conversation.assigned, conversation.deleted
--   AI:             ai.draft_generated, ai.draft_accepted, ai.draft_edited
--   Billing:        billing.plan_changed, billing.payment_succeeded,
--                   billing.payment_failed
--   Security:       security.rate_limit_hit, security.suspicious_request,
--                   security.webhook_auth_failed
--   Data access:    data.export_requested, data.deletion_requested
-- ─────────────────────────────────────────────────────────────────────────────

create type audit_action as enum (
  -- Auth
  'auth.login',
  'auth.logout',
  'auth.login_failed',
  'auth.password_reset',
  'auth.mfa_enrolled',
  'auth.mfa_verified',
  -- User management
  'user.created',
  'user.updated',
  'user.role_changed',
  'user.deactivated',
  'user.deleted',
  'user.invite_sent',
  -- Org settings
  'org.settings_updated',
  'org.name_changed',
  -- Contacts & Companies
  'contact.created',
  'contact.updated',
  'contact.deleted',
  'company.created',
  'company.updated',
  'company.deleted',
  -- Knowledge base
  'knowledge.created',
  'knowledge.updated',
  'knowledge.deleted',
  -- Conversations
  'conversation.resolved',
  'conversation.archived',
  'conversation.assigned',
  'conversation.deleted',
  -- AI
  'ai.draft_generated',
  'ai.draft_accepted',
  'ai.draft_edited',
  -- Billing
  'billing.plan_changed',
  'billing.payment_succeeded',
  'billing.payment_failed',
  -- Security events
  'security.rate_limit_hit',
  'security.suspicious_request',
  'security.webhook_auth_failed',
  -- Data subject rights
  'data.export_requested',
  'data.deletion_requested'
);

create table if not exists audit_logs (
  id              uuid        primary key default gen_random_uuid(),

  -- Tenant scoping (nullable for system-level events like auth failures before org is known)
  org_id          uuid,

  -- Who performed the action (nullable for unauthenticated events)
  actor_id        uuid,               -- public.users.id (not FK — survives deletion)
  actor_email     text,               -- denormalised for readability after deletion
  actor_role      text,               -- role at time of action (denormalised)

  -- What happened
  action          audit_action not null,

  -- What it affected
  resource_type   text,               -- e.g. 'contact', 'user', 'knowledge_entry'
  resource_id     uuid,               -- id of the affected row (not FK)
  resource_label  text,               -- human-readable label (e.g. full_name, email)

  -- State delta (only populated for update/delete events)
  old_values      jsonb,
  new_values      jsonb,

  -- Request metadata
  ip_address      inet,
  user_agent      text,

  -- Outcome
  success         boolean not null default true,
  error_message   text,               -- only for failed events

  -- Immutable timestamp
  created_at      timestamptz not null default now()
);

-- ── Append-only enforcement ───────────────────────────────────────────────────
-- Prevent UPDATE and DELETE on audit_logs even by the service role.
-- This makes the log tamper-evident at the database layer.

create or replace function audit_logs_no_modify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'audit_logs are immutable — modifications are not permitted';
end;
$$;

create trigger audit_logs_prevent_update
  before update on public.audit_logs
  for each row execute function audit_logs_no_modify();

create trigger audit_logs_prevent_delete
  before delete on public.audit_logs
  for each row execute function audit_logs_no_modify();

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary operational queries: org + time range
create index audit_logs_org_time_idx
  on audit_logs (org_id, created_at desc)
  where org_id is not null;

-- Actor lookup (all actions by a specific user)
create index audit_logs_actor_idx
  on audit_logs (actor_id, created_at desc)
  where actor_id is not null;

-- Action-type queries (e.g. all role changes, all failed logins)
create index audit_logs_action_idx
  on audit_logs (action, created_at desc);

-- Resource lookup (all events affecting a specific record)
create index audit_logs_resource_idx
  on audit_logs (resource_type, resource_id)
  where resource_id is not null;

-- Security event fast-path
create index audit_logs_security_idx
  on audit_logs (org_id, created_at desc)
  where action in (
    'auth.login_failed',
    'security.rate_limit_hit',
    'security.suspicious_request',
    'security.webhook_auth_failed'
  );

-- ── Row Level Security ────────────────────────────────────────────────────────
-- No user role (including admin) can read, insert, update, or delete directly.
-- All access is through the service role (admin client in the application layer).
-- Admins can view their org's logs through a dedicated API route.

alter table audit_logs enable row level security;

-- Service role has full access (bypasses RLS by default, but we make it explicit)
create policy "audit_logs_service_all"
  on audit_logs
  for all
  using (auth.role() = 'service_role');

-- Admins and managers can read their own org's logs (SELECT only, no insert/update/delete)
create policy "audit_logs_org_read"
  on audit_logs
  for select
  using (
    org_id in (
      select org_id from public.users
      where auth_user_id = auth.uid()
        and role in ('admin', 'manager')
    )
  );

-- ── Retention helper ──────────────────────────────────────────────────────────
-- Soft cap: audit_logs older than the org's retention period can be purged.
-- The purge function is called by a scheduled job (not inline here).
-- Default retention: 365 days. Can be extended per org via data_retention_policies.

create or replace function purge_expired_audit_logs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  -- Respect per-org retention periods if configured (joined in future migration).
  -- For now, purge logs older than 365 days.
  delete from public.audit_logs
  where created_at < now() - interval '365 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on table audit_logs is
  'Immutable, append-only security event log. Written exclusively by the service role. '
  'Covers authentication events, admin actions, data mutations, billing events, and security anomalies. '
  'Supports SOC 2 CC4.1, CC6.6, CC7.2, CC7.3 requirements.';
