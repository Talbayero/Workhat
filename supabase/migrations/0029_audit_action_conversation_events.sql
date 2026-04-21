-- Migration 0029 — Extend audit_action enum with conversation create/update events
--
-- The audit_action enum in 0027 covers conversation.resolved / archived /
-- assigned / deleted but is missing the two events added by the conversation
-- routes in the application layer:
--
--   conversation.created  — logged when POST /api/conversations succeeds
--   conversation.updated  — logged when PATCH /api/conversations/:id succeeds
--
-- PostgreSQL does not allow removing values from an enum, but adding new
-- values with ALTER TYPE ... ADD VALUE is safe and non-blocking.  The IF NOT
-- EXISTS guard makes the migration idempotent.

alter type audit_action add value if not exists 'conversation.created';
alter type audit_action add value if not exists 'conversation.updated';
