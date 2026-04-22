-- Migration 0031 — Lean workflow events and rules
--
-- This is intentionally not a BPM engine. Rules are org-scoped, event-driven,
-- deterministic JSON definitions evaluated by the application layer.

create table if not exists public.workflow_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text null,
  event_type text not null,
  enabled boolean not null default false,
  priority integer not null default 100,
  conditions_json jsonb not null default '{"all":[]}'::jsonb,
  actions_json jsonb not null default '[]'::jsonb,
  max_actions_per_run integer not null default 10,
  created_by uuid null references public.users(id) on delete set null,
  updated_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_rules_name_length check (char_length(name) between 1 and 160),
  constraint workflow_rules_event_type_check check (
    event_type in (
      'conversation.created',
      'message.received',
      'draft.generated',
      'reply.sent',
      'conversation.updated',
      'risk.changed',
      'sla.breached'
    )
  ),
  constraint workflow_rules_conditions_object check (jsonb_typeof(conditions_json) = 'object'),
  constraint workflow_rules_actions_array check (jsonb_typeof(actions_json) = 'array'),
  constraint workflow_rules_max_actions_check check (max_actions_per_run between 1 and 25)
);

create index if not exists workflow_rules_org_event_enabled_idx
  on public.workflow_rules (org_id, event_type, enabled, priority, created_at);

drop trigger if exists set_workflow_rules_updated_at on public.workflow_rules;
create trigger set_workflow_rules_updated_at
before update on public.workflow_rules
for each row
execute function public.set_updated_at();

create table if not exists public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid null,
  conversation_id uuid null references public.conversations(id) on delete cascade,
  actor_id uuid null references public.users(id) on delete set null,
  source text not null default 'app',
  depth smallint not null default 0,
  correlation_id uuid not null default gen_random_uuid(),
  caused_by_event_id uuid null references public.workflow_events(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint workflow_events_event_type_check check (
    event_type in (
      'conversation.created',
      'message.received',
      'draft.generated',
      'reply.sent',
      'conversation.updated',
      'risk.changed',
      'sla.breached'
    )
  ),
  constraint workflow_events_payload_object check (jsonb_typeof(payload_json) = 'object'),
  constraint workflow_events_depth_check check (depth between 0 and 10)
);

create index if not exists workflow_events_org_type_created_idx
  on public.workflow_events (org_id, event_type, created_at desc);

create index if not exists workflow_events_org_conversation_created_idx
  on public.workflow_events (org_id, conversation_id, created_at desc)
  where conversation_id is not null;

create index if not exists workflow_events_correlation_idx
  on public.workflow_events (correlation_id, created_at);

create table if not exists public.workflow_rule_executions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.workflow_events(id) on delete cascade,
  rule_id uuid not null references public.workflow_rules(id) on delete cascade,
  status text not null,
  condition_result jsonb not null default '{}'::jsonb,
  actions_attempted integer not null default 0,
  actions_succeeded integer not null default 0,
  error_message text null,
  created_at timestamptz not null default now(),
  constraint workflow_rule_executions_status_check check (
    status in ('skipped', 'succeeded', 'failed', 'loop_prevented')
  ),
  constraint workflow_rule_executions_condition_object check (jsonb_typeof(condition_result) = 'object'),
  constraint workflow_rule_executions_unique unique (event_id, rule_id)
);

create index if not exists workflow_rule_executions_org_created_idx
  on public.workflow_rule_executions (org_id, created_at desc);

create index if not exists workflow_rule_executions_rule_created_idx
  on public.workflow_rule_executions (rule_id, created_at desc);

create table if not exists public.workflow_action_executions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  rule_execution_id uuid not null references public.workflow_rule_executions(id) on delete cascade,
  action_index integer not null,
  action_type text not null,
  status text not null,
  resource_type text null,
  resource_id uuid null,
  output_json jsonb not null default '{}'::jsonb,
  error_message text null,
  created_at timestamptz not null default now(),
  constraint workflow_action_executions_status_check check (
    status in ('skipped', 'succeeded', 'failed')
  ),
  constraint workflow_action_executions_output_object check (jsonb_typeof(output_json) = 'object')
);

create index if not exists workflow_action_executions_org_created_idx
  on public.workflow_action_executions (org_id, created_at desc);

create table if not exists public.qa_follow_ups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  assigned_to_user_id uuid null references public.users(id) on delete set null,
  source_event_id uuid null references public.workflow_events(id) on delete set null,
  source_rule_id uuid null references public.workflow_rules(id) on delete set null,
  status text not null default 'open',
  severity text not null default 'medium',
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint qa_follow_ups_status_check check (status in ('open', 'completed', 'dismissed')),
  constraint qa_follow_ups_severity_check check (severity in ('low', 'medium', 'high', 'urgent')),
  constraint qa_follow_ups_reason_length check (char_length(reason) between 1 and 1000)
);

create index if not exists qa_follow_ups_org_status_created_idx
  on public.qa_follow_ups (org_id, status, created_at desc);

create table if not exists public.workflow_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete cascade,
  recipient_user_id uuid null references public.users(id) on delete set null,
  recipient_role text null,
  source_event_id uuid null references public.workflow_events(id) on delete set null,
  source_rule_id uuid null references public.workflow_rules(id) on delete set null,
  status text not null default 'queued',
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  constraint workflow_notifications_status_check check (status in ('queued', 'read', 'dismissed')),
  constraint workflow_notifications_title_length check (char_length(title) between 1 and 200),
  constraint workflow_notifications_body_length check (char_length(body) between 1 and 2000)
);

create index if not exists workflow_notifications_org_status_created_idx
  on public.workflow_notifications (org_id, status, created_at desc);

create table if not exists public.knowledge_gap_candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete cascade,
  source_event_id uuid null references public.workflow_events(id) on delete set null,
  source_rule_id uuid null references public.workflow_rules(id) on delete set null,
  status text not null default 'open',
  title text not null,
  reason text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint knowledge_gap_candidates_status_check check (status in ('open', 'accepted', 'dismissed')),
  constraint knowledge_gap_candidates_title_length check (char_length(title) between 1 and 300),
  constraint knowledge_gap_candidates_reason_length check (char_length(reason) between 1 and 2000),
  constraint knowledge_gap_candidates_evidence_object check (jsonb_typeof(evidence_json) = 'object')
);

create index if not exists knowledge_gap_candidates_org_status_created_idx
  on public.knowledge_gap_candidates (org_id, status, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.workflow_rules enable row level security;
alter table public.workflow_events enable row level security;
alter table public.workflow_rule_executions enable row level security;
alter table public.workflow_action_executions enable row level security;
alter table public.qa_follow_ups enable row level security;
alter table public.workflow_notifications enable row level security;
alter table public.knowledge_gap_candidates enable row level security;

create policy workflow_rules_service_all on public.workflow_rules
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy workflow_rules_select_org on public.workflow_rules
for select to authenticated
using (org_id = public.current_org_id());

create policy workflow_rules_manage_settings on public.workflow_rules
for all to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.current_user_has_capability('settings.manage')
    or public.current_user_has_capability('ai.configure')
  )
)
with check (
  org_id = public.current_org_id()
  and (
    public.current_user_has_capability('settings.manage')
    or public.current_user_has_capability('ai.configure')
  )
);

create policy workflow_events_service_all on public.workflow_events
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy workflow_events_select_org on public.workflow_events
for select to authenticated
using (org_id = public.current_org_id());

create policy workflow_rule_executions_service_all on public.workflow_rule_executions
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy workflow_rule_executions_select_org on public.workflow_rule_executions
for select to authenticated
using (org_id = public.current_org_id());

create policy workflow_action_executions_service_all on public.workflow_action_executions
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy workflow_action_executions_select_org on public.workflow_action_executions
for select to authenticated
using (org_id = public.current_org_id());

create policy qa_follow_ups_service_all on public.qa_follow_ups
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy qa_follow_ups_select_org on public.qa_follow_ups
for select to authenticated
using (org_id = public.current_org_id());

create policy workflow_notifications_service_all on public.workflow_notifications
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy workflow_notifications_select_org on public.workflow_notifications
for select to authenticated
using (
  org_id = public.current_org_id()
  and (
    recipient_user_id is null
    or recipient_user_id in (select id from public.users where auth_user_id = auth.uid())
    or public.current_user_has_capability('settings.manage')
    or public.current_user_has_capability('audit.read')
  )
);

create policy knowledge_gap_candidates_service_all on public.knowledge_gap_candidates
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy knowledge_gap_candidates_select_org on public.knowledge_gap_candidates
for select to authenticated
using (org_id = public.current_org_id());

comment on table public.workflow_rules is
  'Org-scoped deterministic event rules. Conditions and actions are JSON, evaluated by the application workflow engine.';

comment on table public.workflow_events is
  'Operational event log consumed by workflow rules. This is distinct from compliance audit_logs.';

comment on table public.workflow_rule_executions is
  'One evaluation record per workflow event and matching rule, including skipped and failed evaluations.';

comment on table public.workflow_action_executions is
  'Per-action execution records for workflow rule runs.';

comment on table public.qa_follow_ups is
  'Workflow-created QA tasks that can later be promoted into full qa_reviews.';

comment on table public.workflow_notifications is
  'Lightweight in-app notification queue created by workflow actions.';

comment on table public.knowledge_gap_candidates is
  'Workflow-created candidate gaps for knowledge base review.';
