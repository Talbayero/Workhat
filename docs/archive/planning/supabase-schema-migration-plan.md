# Work Hat CRM V1 Supabase Schema and Migration Plan

## Document Status

- Status: Draft V1
- Last Updated: 2026-04-03
- Source: [technical-build-spec.md](C:\Users\Teddy A\OneDrive\Escritorio\Work  Hat\technical-build-spec.md)

## Goal

This document turns the V1 technical spec into a Supabase-oriented database plan with:

- table creation order
- migration phases
- enum and constraint strategy
- index plan
- org isolation expectations
- RLS direction
- notes for future-proofing without overbuilding

The goal is to make implementation straightforward while preserving clean tenant boundaries and AI auditability.

## Database Principles

- all business data is scoped by `org_id`
- schema favors explicitness over hyper-generic abstractions
- launch path is email-first, but channel schema is cross-channel
- outbound messages must always be attributable to a human user
- AI records must capture enough metadata to debug, compare, and measure improvements
- migrations should follow product milestones so the database evolves with real usage

## Postgres Extensions

Enable these up front:

- `pgcrypto`
  For `gen_random_uuid()`
- `citext`
  For case-insensitive email handling
- `pg_trgm`
  For search and fuzzy matching where useful

Optional in early V1:

- `vector`
  Add when embedding-based retrieval becomes real, but schema should leave room for it

## Type Strategy

Use Postgres enums for tightly controlled workflow states that are unlikely to churn often.

Use `text` plus application validation for categories that may evolve quickly.

### Recommended Enums

- `user_role`
  `admin`, `manager`, `agent`, `qa_reviewer`
- `user_status`
  `pending`, `active`, `disabled`
- `channel_type`
  `email`, `sms`
- `channel_status`
  `active`, `disabled`, `error`
- `conversation_status`
  `open`, `closed`, `waiting_on_customer`, `waiting_on_internal`
- `risk_level`
  `green`, `yellow`, `red`
- `sender_type`
  `customer`, `agent`, `system`, `ai`
- `message_direction`
  `inbound`, `outbound`, `internal`

### Keep as Text Initially

- plan names
- knowledge entry types
- AI provider/model identifiers
- edit analysis categories
- usage event types

Reason:

these will likely change faster than core workflow states.

## Common Column Conventions

### IDs

- use `uuid primary key default gen_random_uuid()`

### Timestamps

- use `created_at timestamptz not null default now()`
- use `updated_at timestamptz not null default now()` where records are mutable

### Tenant Scope

- use `org_id uuid not null references organizations(id) on delete cascade` on business tables

### JSON

- use `jsonb not null default '[]'::jsonb` for arrays
- use `jsonb not null default '{}'::jsonb` for objects

### Text Search

- use generated or maintained `tsvector` columns only where search justifies the complexity
- start narrow on search-heavy tables like `knowledge_chunks`

## Migration Phasing

## Phase 0: Foundation

Create:

- extensions
- enums
- shared timestamp trigger function

### Shared Trigger

Create a reusable `set_updated_at()` trigger function and apply it to mutable tables.

## Phase 1: Organizations and Users

Create:

- `organizations`
- `users`

### `organizations`

Columns:

- `id`
- `name`
- `slug`
- `crm_plan`
- `ai_plan`
- `created_at`
- `updated_at`

Constraints:

- unique `slug`
- `name` not null

Indexes:

- unique index on `slug`

### `users`

Columns:

- `id`
- `org_id`
- `auth_user_id`
- `full_name`
- `email`
- `role`
- `status`
- `created_at`
- `updated_at`

Recommended types:

- `email` as `citext`
- `role` as `user_role`
- `status` as `user_status`

Constraints:

- unique `auth_user_id`
- unique `(org_id, email)`

Indexes:

- `(org_id, role)`
- `(org_id, status)`

### Auth Integration Note

Supabase auth users live in `auth.users`.

Application `users.auth_user_id` should reference the authenticated identity but remain in the public schema to support org-level app logic.

## Phase 2: Contacts, Companies, and Channels

Create:

- `companies`
- `contacts`
- `channels`

### `companies`

Columns:

- `id`
- `org_id`
- `name`
- `industry`
- `notes`
- `tags`
- `created_at`
- `updated_at`

Constraints:

- `name` not null

Indexes:

- `(org_id, name)`

### `contacts`

Columns:

- `id`
- `org_id`
- `company_id`
- `first_name`
- `last_name`
- `email`
- `phone`
- `notes`
- `tags`
- `created_at`
- `updated_at`

Recommended types:

- `email` as `citext`
- `phone` as `text`

Constraints:

- allow null email and null phone individually
- require at least one identifier via check:
  `email is not null or phone is not null`

Indexes:

- `(org_id, email)` where `email is not null`
- `(org_id, phone)` where `phone is not null`
- `(org_id, company_id)`

### Contact Matching Note

For launch email flows, matching primarily uses normalized email.

For post-launch SMS, matching should extend to normalized phone without changing the schema.

### `channels`

Columns:

- `id`
- `org_id`
- `type`
- `provider`
- `status`
- `config_json`
- `created_at`
- `updated_at`

Recommended types:

- `type` as `channel_type`
- `status` as `channel_status`

Constraints:

- `provider` not null

Indexes:

- `(org_id, type, status)`

### Security Note on `config_json`

Avoid storing raw provider secrets directly in the table if Supabase secrets or a safer secret-management path is available.

If secrets must be stored temporarily, encrypt at application layer first.

## Phase 3: Conversations and Messages

Create:

- `conversations`
- `messages`

### `conversations`

Columns:

- `id`
- `org_id`
- `contact_id`
- `company_id`
- `channel_id`
- `subject`
- `status`
- `priority`
- `assigned_user_id`
- `risk_level`
- `ai_confidence`
- `last_message_at`
- `created_at`
- `updated_at`

Recommended types:

- `status` as `conversation_status`
- `risk_level` as `risk_level`
- `ai_confidence` as `risk_level`

Constraints:

- `contact_id` not null
- `channel_id` not null
- `last_message_at` not null default now()

Indexes:

- `(org_id, status, last_message_at desc)`
- `(org_id, assigned_user_id, last_message_at desc)`
- `(org_id, contact_id, last_message_at desc)`
- `(org_id, company_id, last_message_at desc)`

### `messages`

Columns:

- `id`
- `org_id`
- `conversation_id`
- `sender_type`
- `sender_user_id`
- `direction`
- `channel_message_id`
- `body_text`
- `body_html`
- `subject`
- `metadata_json`
- `created_at`

Recommended types:

- `sender_type` as `sender_type`
- `direction` as `message_direction`

Constraints:

- `body_text` not null
- unique `(org_id, channel_message_id)` where `channel_message_id is not null`
- check human attribution:
  if `sender_type = 'agent'` then `sender_user_id is not null`

Indexes:

- `(org_id, conversation_id, created_at)`
- `(org_id, channel_message_id)` where `channel_message_id is not null`

### Email Threading Support

Do not add a separate `email_threads` table in the first migration unless the provider model forces it.

Use `metadata_json` to store:

- message headers
- thread identifiers
- provider payload references

If threading logic becomes complex later, introduce a dedicated mapping table in a future migration.

## Phase 4: AI Drafts, Sent Replies, and Edit Analyses

Create:

- `ai_drafts`
- `sent_replies`
- `edit_analyses`

### `ai_drafts`

Columns:

- `id`
- `org_id`
- `conversation_id`
- `source_message_id`
- `generated_by_user_id`
- `draft_text`
- `rationale`
- `confidence_level`
- `risk_flags`
- `missing_context`
- `recommended_tags`
- `provider`
- `model`
- `prompt_version`
- `request_tokens`
- `response_tokens`
- `latency_ms`
- `created_at`

Constraints:

- `draft_text` not null
- `generated_by_user_id` not null
- `prompt_version` not null

Indexes:

- `(org_id, conversation_id, created_at desc)`
- `(org_id, generated_by_user_id, created_at desc)`
- `(org_id, prompt_version)`

### `sent_replies`

Columns:

- `id`
- `org_id`
- `conversation_id`
- `source_ai_draft_id`
- `sent_by_user_id`
- `message_id`
- `body_text`
- `sent_at`

Constraints:

- `sent_by_user_id` not null
- `message_id` not null unique
- `body_text` not null

Indexes:

- `(org_id, conversation_id, sent_at desc)`
- `(org_id, sent_by_user_id, sent_at desc)`

### `edit_analyses`

Columns:

- `id`
- `org_id`
- `conversation_id`
- `ai_draft_id`
- `sent_reply_id`
- `edit_distance_score`
- `change_percent`
- `categories`
- `likely_reason_summary`
- `classification_confidence`
- `raw_diff_json`
- `raw_analysis_json`
- `created_at`

Constraints:

- unique `sent_reply_id`
- `ai_draft_id` not null
- `sent_reply_id` not null

Indexes:

- `(org_id, conversation_id, created_at desc)`
- `(org_id, created_at desc)`

### Analysis Integrity Note

Keep `raw_diff_json` and `raw_analysis_json` for internal debugging and future classifier evaluation.

This is important because measurable AI improvement depends on being able to inspect how classifications were produced.

## Phase 5: Knowledge Base and Retrieval

Create:

- `knowledge_entries`
- `knowledge_chunks`

### `knowledge_entries`

Columns:

- `id`
- `org_id`
- `title`
- `entry_type`
- `source_file_path`
- `source_storage_path`
- `content`
- `tags`
- `channel_scope`
- `is_active`
- `created_by_user_id`
- `created_at`
- `updated_at`

Constraints:

- `title` not null
- `entry_type` not null
- `content` not null
- `created_by_user_id` not null

Indexes:

- `(org_id, entry_type, is_active)`
- `(org_id, channel_scope, is_active)`

### `knowledge_chunks`

Columns:

- `id`
- `org_id`
- `knowledge_entry_id`
- `chunk_index`
- `content`
- `content_tsv`
- `embedding`
- `metadata_json`
- `created_at`

Constraints:

- unique `(knowledge_entry_id, chunk_index)`
- `content` not null

Indexes:

- `(org_id, knowledge_entry_id, chunk_index)`
- GIN on `content_tsv`

Optional later:

- vector index on `embedding`

### File Upload Note

Store uploaded files in Supabase Storage under an org-scoped path such as:

- `orgs/{org_id}/knowledge/{knowledge_entry_id}/original.ext`

The database should store the storage path, not the file binary.

## Phase 6: QA, Usage, and Billing

Create:

- `qa_reviews`
- `usage_events`
- `billing_subscriptions`

### `qa_reviews`

Columns:

- `id`
- `org_id`
- `conversation_id`
- `edit_analysis_id`
- `reviewer_user_id`
- `score`
- `result`
- `categories`
- `notes`
- `created_at`

Indexes:

- `(org_id, reviewer_user_id, created_at desc)`
- `(org_id, conversation_id, created_at desc)`

### `usage_events`

Columns:

- `id`
- `org_id`
- `user_id`
- `event_type`
- `units`
- `metadata_json`
- `created_at`

Constraints:

- `event_type` not null
- `units` not null default 1

Indexes:

- `(org_id, event_type, created_at desc)`
- `(org_id, user_id, created_at desc)`

### `billing_subscriptions`

Columns:

- `id`
- `org_id`
- `provider_customer_id`
- `provider_subscription_id`
- `crm_plan`
- `ai_plan`
- `seat_count`
- `status`
- `renewal_date`
- `created_at`
- `updated_at`

Constraints:

- unique `(org_id)`

Indexes:

- `(provider_customer_id)`
- `(status, renewal_date)`

## Foreign Key and Delete Strategy

Recommended delete behavior:

- `organizations` -> cascade to org-scoped records only if hard-deletion is ever supported
- `companies` -> set null on `contacts.company_id` where appropriate
- `contacts` -> restrict if conversations exist
- `conversations` -> cascade to messages, drafts, sent replies, edit analyses, qa reviews
- `ai_drafts` -> restrict if referenced by sent replies or analyses
- `sent_replies` -> restrict if referenced by edit analyses

Practical V1 note:

prefer soft-delete or inactive states in application logic for user-facing records instead of frequent hard deletes.

## Index Plan Summary

Prioritize indexes for:

- inbox loading
- thread loading
- contact lookup by email/phone
- knowledge retrieval
- AI artifact history by conversation
- usage and dashboard aggregation

### First-Wave Indexes

- organizations: unique `slug`
- users: unique `(org_id, email)`
- contacts: `(org_id, email)` and `(org_id, phone)`
- conversations: `(org_id, status, last_message_at desc)`
- conversations: `(org_id, assigned_user_id, last_message_at desc)`
- messages: `(org_id, conversation_id, created_at)`
- ai_drafts: `(org_id, conversation_id, created_at desc)`
- edit_analyses: `(org_id, created_at desc)`
- usage_events: `(org_id, event_type, created_at desc)`
- knowledge_chunks: GIN on `content_tsv`

## Row Level Security Direction

Supabase supports RLS, and this product benefits from it.

Recommended rollout:

### V1 Minimum

- enforce org scoping in application queries
- enable RLS on core tables
- add simple policies tied to authenticated user membership

### Suggested Policy Model

1. authenticated user maps to `users.auth_user_id`
2. policy checks user org membership
3. row is visible only when `row.org_id = current_user_org_id`

### Tables That Should Get RLS Early

- `organizations`
- `users`
- `companies`
- `contacts`
- `channels`
- `conversations`
- `messages`
- `ai_drafts`
- `sent_replies`
- `edit_analyses`
- `knowledge_entries`
- `knowledge_chunks`
- `qa_reviews`
- `usage_events`
- `billing_subscriptions`

### RLS Caveat

Webhook endpoints and service-role jobs will need server-side bypass behavior using secure service credentials. Keep those paths narrowly scoped and never expose them to the client.

## Recommended SQL Utilities

Useful helper functions or triggers:

- `set_updated_at()`
- `current_app_user_id()`
  Optional helper if you later map auth identity to app user in SQL
- `current_org_id()`
  Optional helper for simpler RLS policies

Optional later:

- `refresh_knowledge_chunk_tsv()`
- materialized views for dashboard rollups

## Migration File Order Recommendation

Recommended file sequence:

1. `0001_extensions_and_enums.sql`
2. `0002_organizations_and_users.sql`
3. `0003_companies_contacts_channels.sql`
4. `0004_conversations_and_messages.sql`
5. `0005_ai_drafts_sent_replies_edit_analyses.sql`
6. `0006_knowledge_entries_and_chunks.sql`
7. `0007_qa_usage_billing.sql`
8. `0008_indexes_and_search.sql`
9. `0009_rls_policies.sql`

If you prefer milestone alignment, combine the migrations per milestone but keep the dependency order intact.

## Milestone Mapping

### Milestone 1

Need:

- organizations
- users

### Milestone 2

Need:

- companies
- contacts
- channels
- conversations
- messages

### Milestone 3

Need:

- ai_drafts
- knowledge_entries
- knowledge_chunks

### Milestone 4

Need:

- sent_replies
- edit_analyses
- qa_reviews optional

### Milestone 5

Need:

- usage_events
- indexes for reporting
- optional summary views later

### Milestone 6

Need:

- billing_subscriptions

## Future-Safe Decisions Worth Keeping

- keep `org_id` everywhere
- keep `prompt_version`, `provider`, and `model` on AI artifacts
- keep `raw_diff_json` and `raw_analysis_json`
- keep `knowledge_chunks` separate from `knowledge_entries`
- keep `channel_type` generic enough for SMS

## Things to Avoid in V1

- polymorphic mega-tables for every entity
- premature event-sourcing
- storing files directly in Postgres
- overusing enums for rapidly changing analytics categories
- building complex SQL reporting before the core workflow is live

## Recommended Next Artifact

The next useful step is to convert this plan into:

- actual Supabase SQL migration files, or
- a single bootstrap schema SQL for Milestones 1 through 3
