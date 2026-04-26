-- Persist Context Engine provenance on AI draft and edit analysis records.

alter table public.ai_drafts
  add column if not exists context_object_id uuid null references public.context_objects(id) on delete set null,
  add column if not exists context_object_version_id uuid null references public.context_object_versions(id) on delete set null;

alter table public.edit_analyses
  add column if not exists context_object_id uuid null references public.context_objects(id) on delete set null,
  add column if not exists context_object_version_id uuid null references public.context_object_versions(id) on delete set null;

create index if not exists ai_drafts_org_context_object_created_idx
  on public.ai_drafts (org_id, context_object_id, created_at desc);

create index if not exists ai_drafts_org_context_version_created_idx
  on public.ai_drafts (org_id, context_object_version_id, created_at desc);

create index if not exists edit_analyses_org_context_object_created_idx
  on public.edit_analyses (org_id, context_object_id, created_at desc);

create index if not exists edit_analyses_org_context_version_created_idx
  on public.edit_analyses (org_id, context_object_version_id, created_at desc);

comment on column public.ai_drafts.context_object_id is
  'Selected context object used during draft generation, if any.';

comment on column public.ai_drafts.context_object_version_id is
  'Exact published context version used during draft generation.';

comment on column public.edit_analyses.context_object_id is
  'Context object associated with the analyzed sent reply, propagated from the source AI draft.';

comment on column public.edit_analyses.context_object_version_id is
  'Exact context version associated with the analyzed sent reply, propagated from the source AI draft.';
