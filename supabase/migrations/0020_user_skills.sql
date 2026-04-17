-- ─────────────────────────────────────────────────────────────────────────────
-- 0020_user_skills.sql
--
-- Adds a skills column to users.
-- Each skill is a jsonb object: { name: string, priority: 1-5 }
-- Priority 1 = primary skill (preferred for routing), 5 = least preferred.
-- ─────────────────────────────────────────────────────────────────────────────

alter table users
  add column if not exists skills jsonb not null default '[]'::jsonb;

comment on column users.skills is
  'Array of {name, priority} objects. Priority 1 = primary, 5 = least preferred.';

-- Index for finding all users with a given skill name within an org.
-- Uses a GIN index on the jsonb array.
create index if not exists users_skills_gin_idx on users using gin (skills);
