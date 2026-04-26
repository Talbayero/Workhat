-- Lean Context Engine V1 authorization and audit support.
--
-- Auth mapping:
--   auth.uid() -> public.users.auth_user_id -> public.users.org_id
--
-- Tenant isolation:
--   All context tables are org-owned and only readable or writable within the
--   caller's org. App-layer capability checks remain primary; RLS provides
--   defense in depth.

alter type audit_action add value if not exists 'context.created';
alter type audit_action add value if not exists 'context.updated';
alter type audit_action add value if not exists 'context.published';
alter type audit_action add value if not exists 'context.archived';

alter table public.role_capabilities
  drop constraint if exists role_capabilities_known_capability;

alter table public.role_capabilities
  add constraint role_capabilities_known_capability check (
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
      'audit.read',
      'context.read',
      'context.edit',
      'context.publish'
    )
  );

alter table public.user_capability_overrides
  drop constraint if exists user_capability_overrides_known_capability;

alter table public.user_capability_overrides
  add constraint user_capability_overrides_known_capability check (
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
      'audit.read',
      'context.read',
      'context.edit',
      'context.publish'
    )
  );

insert into public.role_capabilities (role, capability)
values
  ('admin', 'context.read'),
  ('admin', 'context.edit'),
  ('admin', 'context.publish'),
  ('manager', 'context.read'),
  ('manager', 'context.edit'),
  ('manager', 'context.publish'),
  ('agent', 'context.read'),
  ('qa_reviewer', 'context.read')
on conflict (role, capability) do nothing;

grant select, insert, update, delete on table public.context_objects to authenticated;
grant select, insert, update, delete on table public.context_object_versions to authenticated;

alter table public.context_objects enable row level security;
alter table public.context_object_versions enable row level security;

drop policy if exists context_objects_select_org on public.context_objects;
create policy context_objects_select_org on public.context_objects
for select to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_has_capability('context.read')
);

drop policy if exists context_objects_manage_org on public.context_objects;
create policy context_objects_manage_org on public.context_objects
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_has_capability('context.edit')
)
with check (
  org_id = public.current_org_id()
  and public.current_user_has_capability('context.edit')
);

drop policy if exists context_object_versions_select_org on public.context_object_versions;
create policy context_object_versions_select_org on public.context_object_versions
for select to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_has_capability('context.read')
);

drop policy if exists context_object_versions_manage_org on public.context_object_versions;
create policy context_object_versions_manage_org on public.context_object_versions
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_has_capability('context.edit')
)
with check (
  org_id = public.current_org_id()
  and public.current_user_has_capability('context.edit')
);

comment on policy context_objects_select_org on public.context_objects is
  'Authenticated users may read context objects only inside their own org and only with context.read.';

comment on policy context_objects_manage_org on public.context_objects is
  'Authenticated users may write context objects only inside their own org and only with context.edit.';

comment on policy context_object_versions_select_org on public.context_object_versions is
  'Authenticated users may read context versions only inside their own org and only with context.read.';

comment on policy context_object_versions_manage_org on public.context_object_versions is
  'Authenticated users may write context versions only inside their own org and only with context.edit.';
