-- Migration 0017: Add is_active flag to knowledge_entries
-- Allows admins to deactivate entries without deleting them.
-- Inactive entries are excluded from AI draft retrieval and policy prompts.

alter table public.knowledge_entries
  add column if not exists is_active boolean not null default true;

create index if not exists knowledge_entries_org_active_category_idx
  on public.knowledge_entries (org_id, is_active, category);

comment on column public.knowledge_entries.is_active is
  'When false, this entry is excluded from AI draft context and knowledge retrieval.';
