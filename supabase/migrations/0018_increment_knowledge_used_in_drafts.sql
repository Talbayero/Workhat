-- Migration 0018: RPC to atomically increment used_in_drafts on knowledge entries
-- Called by the AI draft route after a draft is successfully generated.
-- Using a single UPDATE instead of N individual calls avoids race conditions
-- and keeps the hot path cheap.

create or replace function public.increment_knowledge_used_in_drafts(
  entry_ids uuid[]
)
returns void
language sql
security definer
as $$
  update public.knowledge_entries
  set used_in_drafts = used_in_drafts + 1
  where id = any(entry_ids);
$$;

comment on function public.increment_knowledge_used_in_drafts is
  'Atomically increments used_in_drafts for the given entry IDs. Called after AI draft generation.';
