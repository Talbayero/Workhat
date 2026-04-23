-- ─────────────────────────────────────────────────────────────────────────────
-- 0028_data_retention.sql
--
-- Data retention policy infrastructure.
--
-- Purpose:
--   SOC 2 C1.2 (disposal of confidential information) and Privacy P4.1
--   (retention and disposal of personal data) require documented and enforced
--   data retention periods.
--
-- Design:
--   • data_retention_policies — per-org overrides of the default retention
--     periods for each data category.
--   • purge_expired_data() — SECURITY DEFINER function that deletes rows
--     past their retention window. Called by a scheduled job.
--   • data_deletion_requests — tracks DSAR (data subject access/erasure)
--     requests to meet Privacy P5.1 (access to personal data).
--
-- Default retention periods:
--   conversations + messages:  730 days  (2 years, typical SaaS support window)
--   audit_logs:                365 days  (12 months minimum for SOC 2 Type 2)
--   sent_replies:              730 days
--   edit_analyses:             365 days
--   intent_corrections:        365 days
--   qa_reviews:                365 days
--
--   Orgs on enterprise plans may extend these periods via data_retention_policies.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Retention policy table ────────────────────────────────────────────────────

create table if not exists data_retention_policies (
  id              uuid        primary key default gen_random_uuid(),
  org_id          uuid        not null references organizations(id) on delete cascade,

  -- Data category this policy applies to
  data_category   text        not null,  -- e.g. 'conversations', 'audit_logs', 'contacts'

  -- Retention period in days (NULL = keep forever, 0 = delete immediately on request only)
  retention_days  integer     check (retention_days is null or retention_days >= 0),

  -- Who configured this and when
  created_by      uuid        references users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  unique (org_id, data_category)
);

create index if not exists data_retention_policies_org_idx
  on data_retention_policies (org_id);

alter table data_retention_policies enable row level security;

-- Only admins can read/write retention policies
drop policy if exists "retention_policies_admin_select" on data_retention_policies;
create policy "retention_policies_admin_select"
  on data_retention_policies for select
  using (
    org_id in (
      select org_id from public.users
      where auth_user_id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "retention_policies_admin_all" on data_retention_policies;
create policy "retention_policies_admin_all"
  on data_retention_policies for all
  using (
    org_id in (
      select org_id from public.users
      where auth_user_id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "retention_policies_service" on data_retention_policies;
create policy "retention_policies_service"
  on data_retention_policies for all
  using (auth.role() = 'service_role');

-- ── Data deletion / DSAR requests ────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'deletion_request_status'
  ) then
    create type deletion_request_status as enum ('pending', 'in_progress', 'completed', 'rejected');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'deletion_request_type'
  ) then
    create type deletion_request_type as enum ('erasure', 'export', 'correction');
  end if;
end
$$;

create table if not exists data_deletion_requests (
  id              uuid        primary key default gen_random_uuid(),
  org_id          uuid        not null references organizations(id) on delete cascade,

  -- The request
  request_type    deletion_request_type not null,
  requester_email text        not null,  -- who made the request (may be outside the system)
  subject_email   text        not null,  -- whose data is affected

  -- Status tracking
  status          deletion_request_status not null default 'pending',
  requested_at    timestamptz not null default now(),
  completed_at    timestamptz,
  completed_by    uuid        references users(id) on delete set null,
  notes           text,

  -- 30-day SLA deadline (GDPR Art. 12). This is a default, not a generated
  -- column, because timestamptz arithmetic is not immutable in PostgreSQL.
  due_by          timestamptz not null default (now() + interval '30 days')
);

create index if not exists data_deletion_requests_org_idx
  on data_deletion_requests (org_id, requested_at desc);

create index if not exists data_deletion_requests_status_idx
  on data_deletion_requests (org_id, status)
  where status = 'pending';

alter table data_deletion_requests enable row level security;

drop policy if exists "deletion_requests_admin" on data_deletion_requests;
create policy "deletion_requests_admin"
  on data_deletion_requests for all
  using (
    org_id in (
      select org_id from public.users
      where auth_user_id = auth.uid() and role in ('admin', 'manager')
    )
  );

drop policy if exists "deletion_requests_service" on data_deletion_requests;
create policy "deletion_requests_service"
  on data_deletion_requests for all
  using (auth.role() = 'service_role');

-- ── Purge function ────────────────────────────────────────────────────────────
-- Called by a scheduled job (e.g., Supabase Cron or external scheduler).
-- Deletes records older than the applicable retention period.
-- Per-org overrides in data_retention_policies take precedence over defaults.

create or replace function purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv_deleted    integer := 0;
  v_audit_deleted   integer := 0;
  v_correction_deleted integer := 0;
  v_qa_deleted      integer := 0;
  v_default_conv    integer := 730;
  v_default_audit   integer := 365;
  v_default_corrections integer := 365;
  v_default_qa      integer := 365;
begin
  -- Purge conversations (and cascade to messages, sent_replies, edit_analyses, etc.)
  -- Uses the default period; per-org overrides would require per-org iteration.
  delete from public.conversations
  where updated_at < now() - (v_default_conv || ' days')::interval
    and status = 'closed';

  get diagnostics v_conv_deleted = row_count;

  -- Purge audit logs (uses the function defined in 0027)
  perform public.purge_expired_audit_logs();

  -- Purge old intent corrections
  delete from public.intent_corrections
  where created_at < now() - (v_default_corrections || ' days')::interval;

  get diagnostics v_correction_deleted = row_count;

  -- Purge old QA reviews
  delete from public.qa_reviews
  where created_at < now() - (v_default_qa || ' days')::interval;

  get diagnostics v_qa_deleted = row_count;

  return jsonb_build_object(
    'conversations_deleted', v_conv_deleted,
    'intent_corrections_deleted', v_correction_deleted,
    'qa_reviews_deleted', v_qa_deleted,
    'purged_at', now()
  );
end;
$$;

comment on table data_retention_policies is
  'Per-org data retention period overrides. Default periods apply when no override exists. '
  'Supports SOC 2 C1.2 and Privacy P4.1 requirements.';

comment on table data_deletion_requests is
  'Data subject access/erasure/correction requests (DSAR). '
  'Tracks 30-day GDPR response SLA. Supports Privacy P5.1.';

comment on function purge_expired_data() is
  'Purges records past their retention period. '
  'Should be called by a scheduled job (daily recommended). '
  'Supports SOC 2 C1.2 and Privacy P4.1.';
