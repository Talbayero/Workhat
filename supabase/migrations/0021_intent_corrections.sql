-- ─────────────────────────────────────────────────────────────────────────────
-- 0021_intent_corrections.sql
--
-- Intent correction log — written at conversation resolution when an agent
-- confirms or changes the auto-classified intent.
--
-- Powers the self-learning loop:
--   1. Corrections are logged here with the original/corrected intent + note.
--   2. An AI job reads subject + body_preview + closure_note and proposes
--      new keywords for the corrected intent (stored in suggested_keywords).
--   3. Managers review suggestions in Settings → Intents.
--   4. If intent X is repeatedly corrected to intent Y, the system flags X's
--      keyword list as potentially too broad.
-- ─────────────────────────────────────────────────────────────────────────────

create type correction_status as enum ('pending_review', 'applied', 'dismissed');

create table if not exists intent_corrections (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references orgs(id) on delete cascade,
  conversation_id     uuid not null references conversations(id) on delete cascade,

  -- What the system auto-classified vs what the agent corrected it to
  original_intent     text not null,
  corrected_intent    text not null,

  -- Was this a change or a confirmation? (same value = confirmed, different = corrected)
  was_changed         boolean not null generated always as (original_intent <> corrected_intent) stored,

  -- Closure note written by the agent at resolution
  closure_note        text,

  -- Snippet of the conversation used by the AI for keyword analysis
  subject             text,
  body_preview        text,

  -- AI-suggested keywords to add to corrected_intent's keyword list
  suggested_keywords  text[] default '{}',

  -- Whether the manager has reviewed this correction
  status              correction_status not null default 'pending_review',

  -- Who resolved the conversation
  resolved_by         uuid references users(id) on delete set null,

  created_at          timestamptz not null default now()
);

create index intent_corrections_org_idx     on intent_corrections (org_id, created_at desc);
create index intent_corrections_conv_idx    on intent_corrections (conversation_id);
create index intent_corrections_status_idx  on intent_corrections (org_id, status);

-- For pattern detection: how many times was intent X corrected to Y?
create index intent_corrections_pattern_idx
  on intent_corrections (org_id, original_intent, corrected_intent)
  where was_changed = true;

-- RLS
alter table intent_corrections enable row level security;

-- Agents can insert (they resolve conversations)
create policy "intent_corrections_insert_agent"
  on intent_corrections for insert
  with check (
    org_id in (
      select org_id from users where auth_user_id = auth.uid()
    )
  );

-- Managers/admins can read and update (review suggestions)
create policy "intent_corrections_select_manager"
  on intent_corrections for select
  using (
    org_id in (
      select org_id from users
      where auth_user_id = auth.uid()
        and role in ('manager', 'admin', 'qa_reviewer')
    )
  );

create policy "intent_corrections_update_manager"
  on intent_corrections for update
  using (
    org_id in (
      select org_id from users
      where auth_user_id = auth.uid()
        and role in ('manager', 'admin')
    )
  );

-- Service role bypass
create policy "intent_corrections_service_all"
  on intent_corrections for all
  using (auth.role() = 'service_role');
