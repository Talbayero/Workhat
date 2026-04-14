-- Migration 0012: pgvector extension + embedding column on knowledge_chunks
-- Run AFTER 0007.
-- Enables semantic search for AI draft knowledge retrieval.

-- Enable pgvector (requires Supabase project to have the extension available)
create extension if not exists vector;

-- Add embedding column (1536 dims = text-embedding-3-small)
alter table public.knowledge_chunks
  add column if not exists embedding vector(1536) null;

-- IVFFlat index for approximate nearest-neighbor search
-- Build after you have at least ~100 rows for best performance
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RPC function for semantic chunk search, scoped to an org
create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  p_org_id        uuid,
  match_count     int default 4,
  min_similarity  float default 0.5
)
returns table (
  id          uuid,
  entry_id    uuid,
  chunk_index int,
  text        text,
  similarity  float
)
language sql stable
as $$
  select
    kc.id,
    kc.entry_id,
    kc.chunk_index,
    kc.text,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.org_id = p_org_id
    and kc.embedding is not null
    and 1 - (kc.embedding <=> query_embedding) >= min_similarity
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.match_knowledge_chunks is
  'Returns the top-k knowledge chunks most similar to a query embedding, scoped to an org.';
