-- ─────────────────────────────────────────────────────────────────────────────
-- 0022_search_and_intent_indexes.sql
--
-- Two classes of missing indexes:
--
-- 1. GIN trigram indexes for full-text ILIKE search.
--    The /api/search route runs ilike '%term%' on six columns across three
--    tables.  BTREE indexes cannot satisfy leading-wildcard queries, so every
--    search call fell back to a sequential scan.  pg_trgm (already enabled in
--    0001) allows GIN indexes that make ILIKE O(log n) instead of O(n).
--
-- 2. conversations.intent composite index.
--    getIntentStats() fetches (intent, status, risk_level) for all
--    conversations in the last 90 days.  Adding intent to a covering index on
--    (org_id, last_message_at) enables an index-only scan for that query.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Trigram indexes for /api/search ───────────────────────────────────────

-- conversations: subject and preview
CREATE INDEX IF NOT EXISTS conversations_subject_trgm_idx
  ON conversations USING GIN (subject gin_trgm_ops);

CREATE INDEX IF NOT EXISTS conversations_preview_trgm_idx
  ON conversations USING GIN (preview gin_trgm_ops);

-- contacts: full_name and email
CREATE INDEX IF NOT EXISTS contacts_full_name_trgm_idx
  ON contacts USING GIN (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS contacts_email_trgm_idx
  ON contacts USING GIN (email gin_trgm_ops);

-- companies: name and domain
CREATE INDEX IF NOT EXISTS companies_name_trgm_idx
  ON companies USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS companies_domain_trgm_idx
  ON companies USING GIN (domain gin_trgm_ops);

-- ── 2. Intent index on conversations ─────────────────────────────────────────
-- Supports getIntentStats() GROUP BY intent within an org+date-range window.
-- Also useful for any future inbox filtering by intent.
CREATE INDEX IF NOT EXISTS conversations_org_intent_last_message_idx
  ON conversations (org_id, intent, last_message_at DESC);
