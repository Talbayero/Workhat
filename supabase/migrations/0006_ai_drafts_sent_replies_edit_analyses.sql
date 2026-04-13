create table if not exists public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid null references public.messages(id) on delete set null,
  generated_by_user_id uuid not null references public.users(id) on delete restrict,
  draft_text text not null,
  rationale text not null default '',
  confidence_level public.risk_level not null default 'yellow',
  risk_flags jsonb not null default '[]'::jsonb,
  missing_context jsonb not null default '[]'::jsonb,
  recommended_tags jsonb not null default '[]'::jsonb,
  provider text not null default 'openai',
  model text not null default 'gpt-5.4-mini',
  prompt_version text not null,
  request_tokens integer null,
  response_tokens integer null,
  latency_ms integer null,
  created_at timestamptz not null default now()
);

create index if not exists ai_drafts_org_conversation_created_idx
  on public.ai_drafts (org_id, conversation_id, created_at desc);

create index if not exists ai_drafts_org_generated_by_created_idx
  on public.ai_drafts (org_id, generated_by_user_id, created_at desc);

create index if not exists ai_drafts_org_prompt_version_idx
  on public.ai_drafts (org_id, prompt_version);

create table if not exists public.sent_replies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_ai_draft_id uuid null references public.ai_drafts(id) on delete set null,
  sent_by_user_id uuid not null references public.users(id) on delete restrict,
  message_id uuid not null references public.messages(id) on delete restrict,
  body_text text not null,
  sent_at timestamptz not null default now(),
  constraint sent_replies_message_id_unique unique (message_id)
);

create index if not exists sent_replies_org_conversation_sent_at_idx
  on public.sent_replies (org_id, conversation_id, sent_at desc);

create index if not exists sent_replies_org_sent_by_sent_at_idx
  on public.sent_replies (org_id, sent_by_user_id, sent_at desc);

create table if not exists public.edit_analyses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  ai_draft_id uuid not null references public.ai_drafts(id) on delete restrict,
  sent_reply_id uuid not null references public.sent_replies(id) on delete restrict,
  edit_distance_score numeric(8,4) not null,
  change_percent numeric(8,4) not null,
  categories jsonb not null default '[]'::jsonb,
  likely_reason_summary text not null default '',
  classification_confidence numeric(5,4) null,
  raw_diff_json jsonb not null default '{}'::jsonb,
  raw_analysis_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint edit_analyses_sent_reply_unique unique (sent_reply_id)
);

create index if not exists edit_analyses_org_conversation_created_idx
  on public.edit_analyses (org_id, conversation_id, created_at desc);

create index if not exists edit_analyses_org_created_idx
  on public.edit_analyses (org_id, created_at desc);

comment on table public.ai_drafts is
  'Stored AI-generated draft replies and their generation metadata for auditability and analysis.';

comment on table public.sent_replies is
  'Human-approved outbound replies linked back to messages and optional AI drafts.';

comment on table public.edit_analyses is
  'Deterministic diff plus classifier output used to measure AI improvement over time.';
