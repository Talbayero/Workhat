create table if not exists public.role_capabilities (
  role public.user_role not null,
  capability text not null,
  created_at timestamptz not null default now(),
  primary key (role, capability),
  constraint role_capabilities_known_capability check (
    capability in (
      'conversations.read',
      'conversations.reply',
      'conversations.assign',
      'records.manage',
      'ai.generate',
      'ai.configure',
      'knowledge.read',
      'knowledge.edit',
      'qa.review',
      'settings.manage',
      'billing.manage',
      'integrations.manage',
      'team.manage',
      'team.invite',
      'team.skills.manage',
      'audit.read'
    )
  )
);

create table if not exists public.user_capability_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  capability text not null,
  effect text not null,
  reason text null,
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_capability_overrides_user_capability_unique unique (user_id, capability),
  constraint user_capability_overrides_effect_check check (effect in ('grant', 'revoke')),
  constraint user_capability_overrides_known_capability check (
    capability in (
      'conversations.read',
      'conversations.reply',
      'conversations.assign',
      'records.manage',
      'ai.generate',
      'ai.configure',
      'knowledge.read',
      'knowledge.edit',
      'qa.review',
      'settings.manage',
      'billing.manage',
      'integrations.manage',
      'team.manage',
      'team.invite',
      'team.skills.manage',
      'audit.read'
    )
  )
);

create index if not exists idx_user_capability_overrides_org_user
  on public.user_capability_overrides (org_id, user_id);

create index if not exists idx_user_capability_overrides_org_capability
  on public.user_capability_overrides (org_id, capability);

drop trigger if exists set_user_capability_overrides_updated_at on public.user_capability_overrides;
create trigger set_user_capability_overrides_updated_at
before update on public.user_capability_overrides
for each row
execute function public.set_updated_at();

insert into public.role_capabilities (role, capability)
values
  ('admin', 'conversations.read'),
  ('admin', 'conversations.reply'),
  ('admin', 'conversations.assign'),
  ('admin', 'records.manage'),
  ('admin', 'ai.generate'),
  ('admin', 'ai.configure'),
  ('admin', 'knowledge.read'),
  ('admin', 'knowledge.edit'),
  ('admin', 'qa.review'),
  ('admin', 'settings.manage'),
  ('admin', 'billing.manage'),
  ('admin', 'integrations.manage'),
  ('admin', 'team.manage'),
  ('admin', 'team.invite'),
  ('admin', 'team.skills.manage'),
  ('admin', 'audit.read'),
  ('manager', 'conversations.read'),
  ('manager', 'conversations.reply'),
  ('manager', 'conversations.assign'),
  ('manager', 'records.manage'),
  ('manager', 'ai.generate'),
  ('manager', 'ai.configure'),
  ('manager', 'knowledge.read'),
  ('manager', 'knowledge.edit'),
  ('manager', 'qa.review'),
  ('manager', 'billing.manage'),
  ('manager', 'integrations.manage'),
  ('manager', 'team.invite'),
  ('manager', 'team.skills.manage'),
  ('manager', 'audit.read'),
  ('agent', 'conversations.read'),
  ('agent', 'conversations.reply'),
  ('agent', 'ai.generate'),
  ('agent', 'knowledge.read'),
  ('qa_reviewer', 'conversations.read'),
  ('qa_reviewer', 'knowledge.read'),
  ('qa_reviewer', 'qa.review')
on conflict (role, capability) do nothing;

create or replace function public.current_user_has_capability(required_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_user_row as (
    select u.id, u.org_id, u.role
    from public.users u
    where u.auth_user_id = auth.uid()
    limit 1
  ),
  role_grants as (
    select rc.capability
    from public.role_capabilities rc
    join current_user_row u on u.role = rc.role
  ),
  overrides as (
    select o.capability, o.effect
    from public.user_capability_overrides o
    join current_user_row u on u.id = o.user_id and u.org_id = o.org_id
    where o.capability = required_capability
  )
  select coalesce(
    exists (
      select 1
      from overrides
      where effect = 'grant'
    )
    or (
      exists (
        select 1
        from role_grants
        where capability = required_capability
      )
      and not exists (
        select 1
        from overrides
        where effect = 'revoke'
      )
    ),
    false
  )
$$;

alter table public.role_capabilities enable row level security;
alter table public.user_capability_overrides enable row level security;

drop policy if exists role_capabilities_select_authenticated on public.role_capabilities;
create policy role_capabilities_select_authenticated on public.role_capabilities
for select to authenticated
using (true);

drop policy if exists user_capability_overrides_select_org on public.user_capability_overrides;
create policy user_capability_overrides_select_org on public.user_capability_overrides
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists user_capability_overrides_manage_admin on public.user_capability_overrides;
create policy user_capability_overrides_manage_admin on public.user_capability_overrides
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
);

comment on table public.role_capabilities is
  'Compatibility mapping from legacy Work Hat roles to internal authorization capabilities.';

comment on table public.user_capability_overrides is
  'Optional org-scoped per-user capability grants and revokes layered over role capability presets.';

comment on function public.current_user_has_capability(text) is
  'Defense-in-depth helper for RLS and SQL checks. App-layer authorization remains primary.';
