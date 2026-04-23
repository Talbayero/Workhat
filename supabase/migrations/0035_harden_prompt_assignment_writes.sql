-- Migration 0035 — Harden prompt assignment audit writes
--
-- Prompt assignments are audit records. Normal authenticated clients may read
-- org-scoped rows, but inserts and updates must go through trusted server code
-- with the service-role client so assignment persistence cannot be forged or
-- relinked by an ordinary AI-generating user.

drop policy if exists ai_prompt_assignments_insert_generate on public.ai_prompt_assignments;
drop policy if exists ai_prompt_assignments_update_generate on public.ai_prompt_assignments;

comment on table public.ai_prompt_assignments is
  'Auditable sticky prompt assignments for conversation draft generation. Writes are service-role only.';
