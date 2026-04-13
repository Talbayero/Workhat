create table if not exists public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  summary text not null default '',
  content text not null,
  entry_type text not null,
  tags jsonb not null default '[]'::jsonb,
  channel_scope text null,
  source_file_path text null,
  source_storage_path text null,
  is_active boolean not null default true,
  used_in_drafts integer not null default 0,
  created_by_user_id uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_entries_org_type_active_idx
  on public.knowledge_entries (org_id, entry_type, is_active);

create index if not exists knowledge_entries_org_scope_active_idx
  on public.knowledge_entries (org_id, channel_scope, is_active);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  knowledge_entry_id uuid not null references public.knowledge_entries(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint knowledge_chunks_entry_chunk_unique unique (knowledge_entry_id, chunk_index)
);

create index if not exists knowledge_chunks_org_entry_chunk_idx
  on public.knowledge_chunks (org_id, knowledge_entry_id, chunk_index);

drop trigger if exists set_knowledge_entries_updated_at on public.knowledge_entries;
create trigger set_knowledge_entries_updated_at
before update on public.knowledge_entries
for each row
execute function public.set_updated_at();

comment on table public.knowledge_entries is
  'Organization-scoped SOPs, policies, tone guides, and uploaded knowledge used for AI retrieval.';

comment on table public.knowledge_chunks is
  'Chunked retrieval units derived from knowledge entries for search and prompt assembly.';
