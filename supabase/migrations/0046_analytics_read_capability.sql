-- Adds a narrow dashboard/analytics read capability.
--
-- Dashboard analytics summarize org-wide conversations, AI drafts, edit
-- analysis, and QA activity. The capability keeps that surface limited to
-- roles intended to review operational reporting.

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
      'context.publish',
      'analytics.read'
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
      'context.publish',
      'analytics.read'
    )
  );

insert into public.role_capabilities (role, capability)
values
  ('admin', 'analytics.read'),
  ('manager', 'analytics.read')
on conflict (role, capability) do nothing;
