-- Migration 0034 — Prompt experimentation framework
--
-- Controlled prompt experiments are org-scoped, deterministic, and auditable.
-- Drafts remain human-approved before sending; experiments only choose which
-- prompt version/config is used during draft generation.

create table if not exists public.ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  version_key text not null,
  label text not null,
  status text not null default 'active',
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_prompt_versions_org_key_unique unique (org_id, version_key),
  constraint ai_prompt_versions_status_check check (status in ('active', 'stable', 'retired')),
  constraint ai_prompt_versions_key_length check (char_length(version_key) between 1 and 80),
  constraint ai_prompt_versions_label_length check (char_length(label) between 1 and 200),
  constraint ai_prompt_versions_config_object check (jsonb_typeof(config_json) = 'object')
);

create table if not exists public.ai_prompt_experiments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  traffic_seed text not null default encode(gen_random_bytes(12), 'hex'),
  stable_version_key text not null default 'v1.0',
  rollback_version_key text not null default 'v1.0',
  started_at timestamptz null,
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_prompt_experiments_status_check check (status in ('draft', 'running', 'paused', 'rolled_back', 'completed')),
  constraint ai_prompt_experiments_name_length check (char_length(name) between 1 and 200),
  constraint ai_prompt_experiments_stable_key_length check (char_length(stable_version_key) between 1 and 80),
  constraint ai_prompt_experiments_rollback_key_length check (char_length(rollback_version_key) between 1 and 80)
);

create table if not exists public.ai_prompt_experiment_variants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  experiment_id uuid not null references public.ai_prompt_experiments(id) on delete cascade,
  prompt_version_key text not null,
  allocation_percent integer not null default 0,
  is_control boolean not null default false,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_prompt_experiment_variants_allocation_check check (allocation_percent between 0 and 100),
  constraint ai_prompt_experiment_variants_key_length check (char_length(prompt_version_key) between 1 and 80),
  constraint ai_prompt_experiment_variants_config_object check (jsonb_typeof(config_json) = 'object')
);

create table if not exists public.ai_prompt_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  experiment_id uuid null references public.ai_prompt_experiments(id) on delete set null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  ai_draft_id uuid null references public.ai_drafts(id) on delete set null,
  prompt_version_key text not null,
  assignment_key text not null,
  bucket integer null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint ai_prompt_assignments_bucket_check check (bucket is null or bucket between 0 and 99),
  constraint ai_prompt_assignments_key_length check (char_length(prompt_version_key) between 1 and 80)
);

create unique index if not exists ai_prompt_assignments_unique_running_idx
  on public.ai_prompt_assignments (org_id, experiment_id, conversation_id)
  where experiment_id is not null;

create index if not exists ai_prompt_versions_org_status_idx
  on public.ai_prompt_versions (org_id, status, version_key);

create index if not exists ai_prompt_experiments_org_status_idx
  on public.ai_prompt_experiments (org_id, status, created_at desc);

create index if not exists ai_prompt_experiment_variants_experiment_idx
  on public.ai_prompt_experiment_variants (org_id, experiment_id, allocation_percent desc);

create index if not exists ai_prompt_assignments_org_created_idx
  on public.ai_prompt_assignments (org_id, created_at desc);

insert into public.ai_prompt_versions (org_id, version_key, label, status, config_json)
select id, 'v1.0', 'Default draft prompt', 'stable', '{}'::jsonb
from public.organizations
on conflict (org_id, version_key) do nothing;

alter table public.ai_prompt_versions enable row level security;
alter table public.ai_prompt_experiments enable row level security;
alter table public.ai_prompt_experiment_variants enable row level security;
alter table public.ai_prompt_assignments enable row level security;

create policy ai_prompt_versions_service_all on public.ai_prompt_versions
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy ai_prompt_experiments_service_all on public.ai_prompt_experiments
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy ai_prompt_experiment_variants_service_all on public.ai_prompt_experiment_variants
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy ai_prompt_assignments_service_all on public.ai_prompt_assignments
for all using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy ai_prompt_versions_select_org on public.ai_prompt_versions
for select to authenticated
using (org_id = public.current_org_id());

create policy ai_prompt_experiments_select_org on public.ai_prompt_experiments
for select to authenticated
using (org_id = public.current_org_id());

create policy ai_prompt_experiment_variants_select_org on public.ai_prompt_experiment_variants
for select to authenticated
using (org_id = public.current_org_id());

create policy ai_prompt_assignments_select_org on public.ai_prompt_assignments
for select to authenticated
using (org_id = public.current_org_id());

create policy ai_prompt_assignments_insert_generate on public.ai_prompt_assignments
for insert to authenticated
with check (
  org_id = public.current_org_id()
  and public.current_user_has_capability('ai.generate')
);

create policy ai_prompt_assignments_update_generate on public.ai_prompt_assignments
for update to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_has_capability('ai.generate')
)
with check (
  org_id = public.current_org_id()
  and public.current_user_has_capability('ai.generate')
);

create policy ai_prompt_versions_manage_ai on public.ai_prompt_versions
for all to authenticated
using (
  org_id = public.current_org_id()
  and (public.current_user_has_capability('ai.configure') or public.current_user_has_capability('settings.manage'))
)
with check (
  org_id = public.current_org_id()
  and (public.current_user_has_capability('ai.configure') or public.current_user_has_capability('settings.manage'))
);

create policy ai_prompt_experiments_manage_ai on public.ai_prompt_experiments
for all to authenticated
using (
  org_id = public.current_org_id()
  and (public.current_user_has_capability('ai.configure') or public.current_user_has_capability('settings.manage'))
)
with check (
  org_id = public.current_org_id()
  and (public.current_user_has_capability('ai.configure') or public.current_user_has_capability('settings.manage'))
);

create policy ai_prompt_experiment_variants_manage_ai on public.ai_prompt_experiment_variants
for all to authenticated
using (
  org_id = public.current_org_id()
  and (public.current_user_has_capability('ai.configure') or public.current_user_has_capability('settings.manage'))
)
with check (
  org_id = public.current_org_id()
  and (public.current_user_has_capability('ai.configure') or public.current_user_has_capability('settings.manage'))
);

comment on table public.ai_prompt_versions is
  'Org-scoped prompt versions and optional prompt config used by controlled experiments.';

comment on table public.ai_prompt_experiments is
  'Controlled prompt rollout definition with deterministic traffic seed and rollback version.';

comment on table public.ai_prompt_experiment_variants is
  'Weighted prompt variants for an experiment. Allocations are deterministic, not random per request.';

comment on table public.ai_prompt_assignments is
  'Auditable sticky prompt assignments for conversation draft generation.';
