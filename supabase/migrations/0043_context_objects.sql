-- Lean Context Engine V1 core schema.
--
-- Context objects are org-scoped operational guidance records that can be
-- selected during AI draft generation. Published versions are immutable and
-- must remain traceable through ai_drafts and edit_analyses.

create table if not exists public.context_objects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  title text not null,
  description text not null default '',
  category text not null default 'general',
  status text not null default 'draft',
  owner_user_id uuid null references public.users(id) on delete set null,
  reviewer_user_id uuid null references public.users(id) on delete set null,
  current_version_id uuid null,
  active_version_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null,
  constraint context_objects_status_check check (status in ('draft', 'active', 'archived'))
);

create table if not exists public.context_object_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  context_object_id uuid not null references public.context_objects(id) on delete cascade,
  version_number integer not null,
  title text not null,
  description text not null default '',
  context_definition_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint context_object_versions_version_number_positive check (version_number >= 1),
  constraint context_object_versions_unique_version unique (context_object_id, version_number)
);

do $$
begin
  alter table public.context_objects
    add constraint context_objects_current_version_fk
    foreign key (current_version_id)
    references public.context_object_versions(id)
    on delete set null
    deferrable initially deferred;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.context_objects
    add constraint context_objects_active_version_fk
    foreign key (active_version_id)
    references public.context_object_versions(id)
    on delete set null
    deferrable initially deferred;
exception
  when duplicate_object then null;
end $$;

create index if not exists context_objects_org_status_updated_idx
  on public.context_objects (org_id, status, updated_at desc);

create index if not exists context_objects_org_company_status_idx
  on public.context_objects (org_id, company_id, status);

create index if not exists context_objects_org_owner_idx
  on public.context_objects (org_id, owner_user_id);

create index if not exists context_object_versions_org_context_created_idx
  on public.context_object_versions (org_id, context_object_id, created_at desc);

create index if not exists context_object_versions_org_created_by_idx
  on public.context_object_versions (org_id, created_by_user_id, created_at desc);

drop trigger if exists set_context_objects_updated_at on public.context_objects;
create trigger set_context_objects_updated_at
before update on public.context_objects
for each row
execute function public.set_updated_at();

comment on table public.context_objects is
  'Org-scoped operational context records that can be selected for AI draft generation.';

comment on table public.context_object_versions is
  'Immutable version snapshots of context objects used for AI traceability and auditability.';

comment on column public.context_object_versions.context_definition_json is
  'Structured context definition. Expected keys include when_to_use, required_info, decision_rules, allowed_actions, prohibited_actions, escalation_rules, risk_flags, output_guidelines, tone_guidelines, known_gaps, success_metrics, and optional knowledge_entry_ids.';
