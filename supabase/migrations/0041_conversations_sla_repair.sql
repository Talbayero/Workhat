-- Migration 0041 — repair SLA columns/indexes on conversations
--
-- Some live environments lagged the 0032_sla_tracking migration. This repair
-- is intentionally idempotent so it can be applied safely on existing
-- databases without rewriting conversation data.

create table if not exists public.org_sla_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  first_response_minutes integer not null default 60,
  next_response_minutes integer not null default 240,
  at_risk_threshold_minutes integer not null default 15,
  business_hours_json jsonb not null default '{"mode":"calendar"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  constraint org_sla_policies_org_unique unique (org_id),
  constraint org_sla_policies_positive_first_response check (first_response_minutes between 1 and 10080),
  constraint org_sla_policies_positive_next_response check (next_response_minutes between 1 and 10080),
  constraint org_sla_policies_positive_at_risk check (at_risk_threshold_minutes between 1 and 1440)
);

alter table public.conversations
  add column if not exists first_response_due_at timestamptz,
  add column if not exists next_response_due_at timestamptz,
  add column if not exists sla_status text not null default 'not_applicable',
  add column if not exists sla_target text,
  add column if not exists sla_due_at timestamptz,
  add column if not exists sla_breached_at timestamptz,
  add column if not exists sla_last_evaluated_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists last_customer_message_at timestamptz,
  add column if not exists last_agent_response_at timestamptz;

do $$
begin
  alter table public.conversations
    add constraint conversations_sla_status_check
    check (sla_status in ('not_applicable', 'ok', 'at_risk', 'breached'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.conversations
    add constraint conversations_sla_target_check
    check (sla_target is null or sla_target in ('first_response', 'next_response'));
exception
  when duplicate_object then null;
end $$;

create index if not exists org_sla_policies_org_idx
  on public.org_sla_policies (org_id);

create index if not exists conversations_org_sla_idx
  on public.conversations (org_id, sla_status, sla_due_at)
  where status in ('open', 'waiting_on_customer', 'waiting_on_internal');

create index if not exists conversations_org_status_sla_idx
  on public.conversations (org_id, status, sla_due_at);

create index if not exists conversations_org_assignee_sla_idx
  on public.conversations (org_id, assigned_user_id, sla_status);

insert into public.org_sla_policies (org_id)
select id
from public.organizations
on conflict (org_id) do nothing;

alter table public.org_sla_policies enable row level security;

drop policy if exists org_sla_policies_service_all on public.org_sla_policies;
create policy org_sla_policies_service_all
on public.org_sla_policies
for all
to service_role
using (true)
with check (true);

drop policy if exists org_sla_policies_org_select on public.org_sla_policies;
create policy org_sla_policies_org_select
on public.org_sla_policies
for select
to authenticated
using (org_id = public.current_org_id());

drop policy if exists org_sla_policies_org_manage on public.org_sla_policies;
create policy org_sla_policies_org_manage
on public.org_sla_policies
for all
to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_has_capability('settings.manage')
)
with check (
  org_id = public.current_org_id()
  and public.current_user_has_capability('settings.manage')
);
