-- Migration 0007: Knowledge entries and retrieval chunks
-- Schema aligned with application queries.ts and knowledge API routes.

create table if not exists public.knowledge_entries (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  title        text not null,
  summary      text not null default '',
  body         text not null default '',
  category     text not null default 'sop',
  tags         jsonb not null default '[]'::jsonb,
  used_in_drafts integer not null default 0,
  last_updated date not null default current_date,
  updated_by   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists knowledge_entries_org_category_idx
  on public.knowledge_entries (org_id, category);

create index if not exists knowledge_entries_org_used_drafts_idx
  on public.knowledge_entries (org_id, used_in_drafts desc);

create table if not exists public.knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  entry_id    uuid not null references public.knowledge_entries(id) on delete cascade,
  chunk_index integer not null,
  text        text not null,
  content_tsv tsvector generated always as (to_tsvector('english', text)) stored,
  created_at  timestamptz not null default now(),
  constraint knowledge_chunks_entry_chunk_unique unique (entry_id, chunk_index)
);

create index if not exists knowledge_chunks_org_entry_chunk_idx
  on public.knowledge_chunks (org_id, entry_id, chunk_index);

create index if not exists knowledge_chunks_content_tsv_idx
  on public.knowledge_chunks using gin (content_tsv);

drop trigger if exists set_knowledge_entries_updated_at on public.knowledge_entries;
create trigger set_knowledge_entries_updated_at
before update on public.knowledge_entries
for each row
execute function public.set_updated_at();

comment on table public.knowledge_entries is
  'SOPs, policies, tone guides, and product context fed into AI draft generation.';

comment on table public.knowledge_chunks is
  'Chunked retrieval units. Full-text indexed via content_tsv; embedding column added in 0012.';
