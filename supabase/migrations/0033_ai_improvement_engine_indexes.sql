-- Migration 0033 — AI Improvement Engine query support
--
-- V1 computes insights from existing ai_drafts, edit_analyses, and knowledge
-- tables. These indexes keep prompt-version comparisons and repeated-pattern
-- analysis scoped and cheap without introducing a snapshot table yet.

create index if not exists edit_analyses_org_draft_created_idx
  on public.edit_analyses (org_id, ai_draft_id, created_at desc);

create index if not exists edit_analyses_org_change_created_idx
  on public.edit_analyses (org_id, change_percent desc, created_at desc);

create index if not exists knowledge_entries_org_active_used_idx
  on public.knowledge_entries (org_id, is_active, used_in_drafts desc);

comment on index public.edit_analyses_org_draft_created_idx is
  'Supports AI Improvement Engine joins from edit analyses to draft prompt versions.';

comment on index public.edit_analyses_org_change_created_idx is
  'Supports repeated high-edit pattern analysis by org.';
