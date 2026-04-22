-- Migration 0035: Extend audit_action enum with intent and QA review actions
--
-- Adds coverage for intent configuration changes and QA review submissions,
-- which are governance-relevant events that must appear in the audit trail.

alter type audit_action add value if not exists 'intent.created';
alter type audit_action add value if not exists 'intent.updated';
alter type audit_action add value if not exists 'intent.deleted';
alter type audit_action add value if not exists 'intent.correction_submitted';
alter type audit_action add value if not exists 'qa.review_submitted';
