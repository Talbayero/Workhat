-- Repair missing authenticated grants for org-scoped reads/writes.
--
-- Root cause:
--   Earlier migrations enabled RLS and created authenticated policies, but only
--   made service_role table grants explicit. In PostgreSQL, RLS policies do not
--   apply unless the role also has the base table privilege, so authenticated
--   users could still hit "permission denied for table users/conversations".
--
-- Auth mapping:
--   auth.uid() -> public.users.auth_user_id -> public.users.org_id
--   public.current_org_id() and related helpers are SECURITY DEFINER
--   functions, so policies can resolve the caller's tenant safely.
--
-- Tenant isolation:
--   These GRANTs only allow the authenticated role to reach tables that already
--   have org-scoped RLS policies. Cross-org reads remain blocked by those
--   policies. Raw email_connections is intentionally excluded because it stores
--   encrypted provider credentials and should stay behind server-only routes.

grant usage on schema public to authenticated;

-- Core tenant identity and inbox read path.
grant select on table public.organizations to authenticated;
grant select, insert, update, delete on table public.users to authenticated;
grant select, insert, update, delete on table public.channels to authenticated;
grant select, insert, update, delete on table public.companies to authenticated;
grant select, insert, update, delete on table public.contacts to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;

-- Inbox-adjacent runtime tables used by settings, QA, and analytics.
grant select, insert, update, delete on table public.org_sla_policies to authenticated;
grant select, insert, update, delete on table public.ai_drafts to authenticated;
grant select, insert, update, delete on table public.sent_replies to authenticated;
grant select, insert, update, delete on table public.edit_analyses to authenticated;
grant select, insert, update, delete on table public.knowledge_entries to authenticated;
grant select, insert, update, delete on table public.knowledge_chunks to authenticated;
grant select, insert, update, delete on table public.qa_reviews to authenticated;
grant select, insert, update, delete on table public.usage_events to authenticated;
grant select, insert, update, delete on table public.billing_subscriptions to authenticated;

-- Supporting product surfaces that already rely on authenticated RLS policies.
grant select, insert, update, delete on table public.intents to authenticated;
grant select, insert, update, delete on table public.intent_corrections to authenticated;
grant select on table public.audit_logs to authenticated;
grant select on table public.role_capabilities to authenticated;
grant select, insert, update, delete on table public.user_capability_overrides to authenticated;
grant select on table public.workflow_rules to authenticated;
grant select on table public.workflow_events to authenticated;
grant select on table public.workflow_rule_executions to authenticated;
grant select on table public.workflow_action_executions to authenticated;
grant select on table public.qa_follow_ups to authenticated;
grant select on table public.workflow_notifications to authenticated;
grant select on table public.knowledge_gap_candidates to authenticated;
grant select on table public.inbound_email_events to authenticated;
grant select on table public.ai_prompt_versions to authenticated;
grant select on table public.ai_prompt_experiments to authenticated;
grant select on table public.ai_prompt_experiment_variants to authenticated;
grant select, insert, update on table public.ai_prompt_assignments to authenticated;
