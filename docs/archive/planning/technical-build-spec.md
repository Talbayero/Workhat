# Work Hat CRM V1 Technical Build Spec

## Document Status

- Status: Draft V1
- Last Updated: 2026-04-03
- Source: [prd.md](C:\Users\Teddy A\OneDrive\Escritorio\Work  Hat\prd.md)

## Purpose

This document translates the product requirements into an implementation-ready technical blueprint for V1.

It is optimized for these decisions already locked in:

- email launches first
- SMS is added immediately after launch using the same channel abstractions
- first buyer is a founder/operator-led SMB
- all outbound customer messages require human approval
- AI compare view is optional for agents and regular for managers/QA
- knowledge supports structured text and file uploads
- platform is multi-tenant SaaS first, with clean enterprise-sensitive foundations
- primary ROI is measurable AI improvement over time

## Build Goals

V1 should enable a small support team to:

- receive inbound email conversations in a unified inbox
- view customer and account context beside the thread
- generate AI-assisted reply drafts
- edit and send those replies manually
- compare AI draft versus final reply
- aggregate edit analysis into management insight

The system should be built to make AI improvement measurable, not just AI generation available.

## Recommended Stack

### Application

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend Services

- Supabase Postgres
- Supabase Auth
- Supabase Storage
- Supabase Edge Functions only if needed later

### AI Layer

- OpenAI as first provider
- provider abstraction from day one
- structured JSON outputs for all AI workflows

### External Services

- Email ingest/send: Postmark or Resend first
- Billing: Stripe
- Error monitoring: Sentry
- Product analytics: PostHog or equivalent

### Retrieval

- Postgres full-text or pgvector-ready schema
- retrieval layer designed so embeddings can be added without schema churn

## System Architecture

### High-Level Shape

1. `web app`
   Renders inbox, thread workspace, settings, dashboards

2. `app API`
   Handles authenticated app reads/writes, orchestration, validation, and RBAC

3. `inbound channel handlers`
   Accept email webhooks, normalize payloads, map contact/thread, create conversation/messages

4. `AI orchestration layer`
   Builds prompt context, calls provider, validates structured output, persists artifacts

5. `analysis layer`
   Computes deterministic diff, then runs LLM-based categorization and stores results

6. `data layer`
   Stores org, user, contact, conversation, message, draft, sent reply, knowledge, usage, billing data

### Architectural Rules

- organization boundary is the primary tenant boundary
- every application read/write must be scoped by `org_id`
- AI generation and AI analysis are separate workflows
- deterministic diff runs before LLM categorization
- outbound send path must enforce human approval
- inbound normalization must be channel-agnostic even though only email is live at launch

## App Structure Recommendation

### Routes

- `/login`
- `/signup`
- `/onboarding`
- `/inbox`
- `/inbox/[conversationId]`
- `/contacts`
- `/contacts/[contactId]`
- `/companies`
- `/companies/[companyId]`
- `/dashboard`
- `/settings/general`
- `/settings/channels`
- `/settings/ai`
- `/settings/knowledge`
- `/settings/users`
- `/billing`

### Suggested Server Modules

- `src/lib/auth`
- `src/lib/org`
- `src/lib/rbac`
- `src/lib/db`
- `src/lib/channels`
- `src/lib/channels/email`
- `src/lib/channels/sms`
- `src/lib/ai`
- `src/lib/ai/providers`
- `src/lib/ai/prompts`
- `src/lib/ai/schemas`
- `src/lib/analysis`
- `src/lib/retrieval`
- `src/lib/billing`
- `src/lib/usage`

### Suggested UI Domains

- `src/components/inbox`
- `src/components/conversation`
- `src/components/customer`
- `src/components/ai`
- `src/components/dashboard`
- `src/components/settings`

## Authentication and Authorization

### Auth Model

- use Supabase Auth for sign up, login, session management
- each user belongs to one organization in V1
- invites create pending users tied to an organization

### Roles

- `admin`
- `manager`
- `agent`
- `qa_reviewer`

### RBAC Requirements

- admins: full org configuration, billing, user management
- managers: operational visibility, dashboards, review surfaces
- agents: inbox work, reply drafting, manual sends
- qa_reviewers: compare, classification review, coaching

### Enforcement

- enforce RBAC in API handlers, not just UI
- add row-level org scoping in queries
- reserve stricter RLS rollout if desired, but app-layer enforcement is minimum required

## Data Model

## Core Tables

### `organizations`

- `id` uuid pk
- `name` text
- `slug` text unique
- `crm_plan` text
- `ai_plan` text
- `created_at` timestamptz
- `updated_at` timestamptz

### `users`

- `id` uuid pk
- `org_id` uuid fk -> organizations.id
- `auth_user_id` uuid unique
- `full_name` text
- `email` text
- `role` text
- `status` text
- `created_at` timestamptz
- `updated_at` timestamptz

Indexes:

- `(org_id, email)`
- `(org_id, role)`

### `companies`

- `id` uuid pk
- `org_id` uuid fk
- `name` text
- `industry` text null
- `notes` text null
- `tags` jsonb default `[]`
- `created_at` timestamptz
- `updated_at` timestamptz

Indexes:

- `(org_id, name)`

### `contacts`

- `id` uuid pk
- `org_id` uuid fk
- `company_id` uuid fk null
- `first_name` text null
- `last_name` text null
- `email` text null
- `phone` text null
- `notes` text null
- `tags` jsonb default `[]`
- `created_at` timestamptz
- `updated_at` timestamptz

Indexes:

- `(org_id, email)`
- `(org_id, phone)`
- `(org_id, company_id)`

### `channels`

- `id` uuid pk
- `org_id` uuid fk
- `type` text
- `provider` text
- `status` text
- `config_json` jsonb
- `created_at` timestamptz
- `updated_at` timestamptz

Expected `type` values:

- `email`
- `sms`

### `conversations`

- `id` uuid pk
- `org_id` uuid fk
- `contact_id` uuid fk
- `company_id` uuid fk null
- `channel_id` uuid fk
- `subject` text null
- `status` text
- `priority` text null
- `assigned_user_id` uuid fk null
- `risk_level` text null
- `ai_confidence` text null
- `last_message_at` timestamptz
- `created_at` timestamptz
- `updated_at` timestamptz

Expected `status` values:

- `open`
- `closed`
- `waiting_on_customer`
- `waiting_on_internal`

Expected `risk_level` values:

- `green`
- `yellow`
- `red`

Indexes:

- `(org_id, status, last_message_at desc)`
- `(org_id, assigned_user_id, last_message_at desc)`
- `(org_id, contact_id)`

### `messages`

- `id` uuid pk
- `org_id` uuid fk
- `conversation_id` uuid fk
- `sender_type` text
- `sender_user_id` uuid fk null
- `direction` text
- `channel_message_id` text null
- `body_text` text
- `body_html` text null
- `subject` text null
- `metadata_json` jsonb
- `created_at` timestamptz

Expected `sender_type` values:

- `customer`
- `agent`
- `system`
- `ai`

Expected `direction` values:

- `inbound`
- `outbound`
- `internal`

Indexes:

- `(org_id, conversation_id, created_at)`
- `(org_id, channel_message_id)`

### `ai_drafts`

- `id` uuid pk
- `org_id` uuid fk
- `conversation_id` uuid fk
- `source_message_id` uuid fk null
- `generated_by_user_id` uuid fk
- `draft_text` text
- `rationale` text
- `confidence_level` text
- `risk_flags` jsonb default `[]`
- `missing_context` jsonb default `[]`
- `recommended_tags` jsonb default `[]`
- `provider` text
- `model` text
- `prompt_version` text
- `request_tokens` integer null
- `response_tokens` integer null
- `latency_ms` integer null
- `created_at` timestamptz

Indexes:

- `(org_id, conversation_id, created_at desc)`
- `(org_id, generated_by_user_id, created_at desc)`

### `sent_replies`

- `id` uuid pk
- `org_id` uuid fk
- `conversation_id` uuid fk
- `source_ai_draft_id` uuid fk null
- `sent_by_user_id` uuid fk
- `message_id` uuid fk
- `body_text` text
- `sent_at` timestamptz

Indexes:

- `(org_id, conversation_id, sent_at desc)`

### `edit_analyses`

- `id` uuid pk
- `org_id` uuid fk
- `conversation_id` uuid fk
- `ai_draft_id` uuid fk
- `sent_reply_id` uuid fk
- `edit_distance_score` numeric
- `change_percent` numeric
- `categories` jsonb default `[]`
- `likely_reason_summary` text
- `classification_confidence` numeric null
- `raw_diff_json` jsonb
- `raw_analysis_json` jsonb
- `created_at` timestamptz

Indexes:

- `(org_id, conversation_id, created_at desc)`
- `(org_id, created_at desc)`

### `knowledge_entries`

- `id` uuid pk
- `org_id` uuid fk
- `title` text
- `entry_type` text
- `source_file_path` text null
- `source_storage_path` text null
- `content` text
- `tags` jsonb default `[]`
- `channel_scope` text null
- `is_active` boolean default true
- `created_by_user_id` uuid fk
- `created_at` timestamptz
- `updated_at` timestamptz

Expected `entry_type` values:

- `rule`
- `faq`
- `sop`
- `tone_guide`
- `uploaded_doc`

### `knowledge_chunks`

- `id` uuid pk
- `org_id` uuid fk
- `knowledge_entry_id` uuid fk
- `chunk_index` integer
- `content` text
- `content_tsv` tsvector null
- `embedding` vector null
- `metadata_json` jsonb
- `created_at` timestamptz

Indexes:

- `(org_id, knowledge_entry_id, chunk_index)`

### `qa_reviews`

- `id` uuid pk
- `org_id` uuid fk
- `conversation_id` uuid fk
- `edit_analysis_id` uuid fk null
- `reviewer_user_id` uuid fk
- `score` numeric null
- `result` text null
- `categories` jsonb default `[]`
- `notes` text null
- `created_at` timestamptz

### `usage_events`

- `id` uuid pk
- `org_id` uuid fk
- `user_id` uuid fk null
- `event_type` text
- `units` integer
- `metadata_json` jsonb
- `created_at` timestamptz

Expected `event_type` values:

- `ai_draft_generated`
- `ai_summary_generated`
- `edit_analysis_generated`
- `email_sent`
- `email_received`

### `billing_subscriptions`

- `id` uuid pk
- `org_id` uuid fk
- `provider_customer_id` text
- `provider_subscription_id` text null
- `crm_plan` text
- `ai_plan` text
- `seat_count` integer
- `status` text
- `renewal_date` timestamptz null
- `created_at` timestamptz
- `updated_at` timestamptz

## Tenant and Audit Requirements

- all business tables carry `org_id`
- all app queries must constrain by `org_id`
- all AI artifacts must be attributable to user, org, model, and prompt version
- all outbound messages must be attributable to a human sender

## Conversation and Channel Model

### Launch Channel Flow: Email

1. provider sends inbound webhook
2. webhook handler verifies signature
3. handler normalizes provider payload to internal email schema
4. system matches or creates contact by email address
5. system finds existing thread by provider thread headers or conversation mapping
6. system creates or updates conversation
7. system stores inbound message
8. system updates `last_message_at`

### Post-Launch Channel Flow: SMS

SMS should plug into the same normalized message pipeline with:

- channel-specific identity matching by phone
- no email subject support
- shorter composer and risk rules if needed

### Normalized Message Contract

Internal normalized payload should contain:

- `orgId`
- `channelType`
- `provider`
- `externalThreadId`
- `externalMessageId`
- `from`
- `to`
- `subject`
- `bodyText`
- `bodyHtml`
- `receivedAt`
- `metadata`

## AI Orchestration

## AI Workflows

### 1. Thread Summary

Purpose:

- quickly orient the user on open context

Input:

- recent messages
- contact data
- company data

Output:

- short summary
- unresolved issues
- suggested next action

### 2. Draft Reply Generation

Purpose:

- generate an editable customer reply draft

Inputs:

- recent conversation messages
- contact and company context
- relevant knowledge chunks
- tone and rules
- current user role

Structured output:

- `draftText`
- `rationale`
- `confidenceLevel`
- `riskFlags`
- `missingContext`
- `recommendedTags`

### 3. Edit Analysis

Purpose:

- classify how the human changed the AI draft and what that implies

Inputs:

- raw diff result
- original AI draft
- final reply
- optional thread context

Structured output:

- `categories`
- `likelyReasonSummary`
- `classificationConfidence`
- `shouldEscalate`

## Prompt Architecture

Separate prompt layers:

1. system behavior
2. org policy and tone
3. retrieved knowledge snippets
4. conversation context
5. output schema instructions

Do not build one mega-prompt string without structure or versioning.

### Prompt Versioning

- every AI request stores `prompt_version`
- prompt version changes are tracked in code
- dashboard filters should later be able to compare outcomes by prompt version

## Retrieval Design

### V1 Strategy

- create chunks for knowledge entries and uploaded docs
- rank by keyword or hybrid search
- return a small top-k set
- include citation metadata internally for debugging

### Constraints

- avoid over-fetching large docs
- prefer concise chunks to reduce token waste
- preserve source references for internal review

## Diff and Analysis Pipeline

### Step 1: Deterministic Diff

Use a local text diff algorithm to compute:

- insertions
- deletions
- replacements
- similarity score
- edit distance score
- changed span count

### Step 2: Heuristic Pre-Classification

Optional but recommended:

- detect grammar-only changes
- detect personalization additions
- detect policy phrase insertion or removal

### Step 3: LLM-Based Classification

Run only after deterministic diff and pass:

- original draft
- final reply
- compact diff summary
- allowed categories

### Stored Analysis Output

- compact human-readable summary
- machine-readable categories
- confidence score
- raw diff object
- raw model output

## API Blueprint

All API routes assume authenticated org-scoped access unless they are webhook endpoints.

## Auth and Org

### `POST /api/org/create`

Request:

```json
{
  "orgName": "Acme Support",
  "userFullName": "Jane Doe"
}
```

Response:

```json
{
  "organization": {
    "id": "org_123",
    "name": "Acme Support",
    "slug": "acme-support"
  },
  "user": {
    "id": "user_123",
    "role": "admin"
  }
}
```

### `POST /api/invite`

Request:

```json
{
  "email": "agent@acme.com",
  "role": "agent"
}
```

### `GET /api/me`

Returns current session, org, role, and plan summary.

## Conversations

### `GET /api/conversations`

Query params:

- `status`
- `assignee`
- `risk`
- `channel`
- `search`
- `cursor`

Response returns paginated list with lightweight conversation cards.

### `GET /api/conversations/:id`

Returns:

- conversation metadata
- contact summary
- company summary
- latest AI state

### `PATCH /api/conversations/:id`

Used for:

- status change
- priority change
- assignment

### `POST /api/conversations/:id/tag`

Request:

```json
{
  "tag": "refund"
}
```

## Messages

### `GET /api/conversations/:id/messages`

Returns full thread with internal notes and channel metadata.

### `POST /api/conversations/:id/reply`

Rules:

- requires authenticated user
- requires explicit human action
- may optionally reference `sourceAiDraftId`
- creates outbound message and sent reply record
- emits usage event

Request:

```json
{
  "bodyText": "Thanks for reaching out. We have updated your order.",
  "sourceAiDraftId": "draft_123"
}
```

Response:

```json
{
  "messageId": "msg_123",
  "sentReplyId": "reply_123",
  "conversationId": "conv_123",
  "status": "sent"
}
```

## AI

### `POST /api/ai/draft`

Request:

```json
{
  "conversationId": "conv_123",
  "sourceMessageId": "msg_123"
}
```

Response:

```json
{
  "draft": {
    "id": "draft_123",
    "draftText": "Thanks for your message...",
    "confidenceLevel": "yellow",
    "riskFlags": ["missing_order_status"],
    "missingContext": ["tracking number"],
    "recommendedTags": ["shipping"],
    "rationale": "Customer asked about shipping delay and order tracking."
  }
}
```

### `POST /api/ai/summarize`

Generates compact thread summary and unresolved items.

### `POST /api/ai/analyze-edit`

Request:

```json
{
  "aiDraftId": "draft_123",
  "sentReplyId": "reply_123"
}
```

Response:

```json
{
  "analysis": {
    "id": "analysis_123",
    "changePercent": 0.34,
    "categories": ["missing_information", "personalization"],
    "likelyReasonSummary": "The agent added order-specific details and personalized the greeting.",
    "classificationConfidence": 0.82
  }
}
```

## Knowledge

### `GET /api/knowledge`

Returns org-scoped entries with filters by `entryType`, `isActive`, `tag`.

### `POST /api/knowledge`

Accepts either:

- structured text entry
- uploaded file metadata plus extracted text

Minimum request shape:

```json
{
  "title": "Refund SOP",
  "entryType": "sop",
  "content": "Refunds over $100 require manager approval.",
  "tags": ["refunds"],
  "channelScope": "email"
}
```

### `PATCH /api/knowledge/:id`

Update title, content, active state, tags, or scope.

## Dashboard

### `GET /api/dashboard/manager`

Returns:

- throughput metrics
- AI usage metrics
- AI quality trend
- top failure categories

### `GET /api/dashboard/agent`

Returns:

- personal activity
- AI usage
- edit tendency

### `GET /api/dashboard/qa`

Returns:

- review volume
- quality categories
- escalated patterns

## Billing

### `GET /api/billing`

Returns current CRM plan, AI plan, seats, renewal date, current usage summary.

### `POST /api/billing/checkout`

Creates Stripe checkout or billing portal session.

## Inbound Webhooks

### `POST /api/inbound/email/webhook`

Requirements:

- verify provider signature
- idempotency by external message ID
- parse thread headers when available
- store raw provider metadata
- return fast acknowledgement

### `POST /api/inbound/sms/webhook`

Not live at launch, but route shape should be reserved for parity.

## Background Jobs and Async Tasks

Recommended async jobs:

- knowledge file extraction and chunking
- AI draft generation if not kept synchronous
- edit analysis after message send
- dashboard aggregate refresh
- usage reconciliation

If background infrastructure is not yet introduced, keep AI draft sync and move edit analysis async first.

## Usage Tracking

Track at minimum:

- AI drafts generated
- thread summaries generated
- edit analyses generated
- inbound emails processed
- outbound replies sent

Each usage event should include:

- `org_id`
- `user_id` when applicable
- `event_type`
- `units`
- `metadata_json`

## Error Handling and Observability

### Must Capture

- webhook failures
- outbound email failures
- AI provider failures
- invalid AI structured outputs
- retrieval misses
- permission failures

### Logging Principles

- do not log raw secrets
- avoid storing sensitive full payloads unnecessarily in app logs
- keep internal correlation IDs for AI requests and channel events

## Security and Compliance Foundations

V1 does not need full enterprise compliance packaging, but should include:

- org-scoped data isolation
- secure webhook verification
- least-privilege API access
- auditable attribution for outbound messages
- auditable attribution for AI outputs
- secure file storage paths by org

## Milestones

## Milestone 1: Skeleton

Deliver:

- auth
- org creation
- roles
- app shell
- inbox with mock data

Exit criteria:

- user can sign in and reach a realistic inbox UI

## Milestone 2: Real Email Inbox

Deliver:

- email webhook ingest
- contact auto-match/create
- conversation and message persistence
- thread detail screen
- manual reply send

Exit criteria:

- real inbound email creates usable conversations
- agent can send outbound email manually

## Milestone 3: AI Drafting

Deliver:

- retrieval context assembly
- AI draft API
- draft persistence
- confidence and risk display

Exit criteria:

- agent can generate draft inside conversation workspace
- draft metadata is stored and visible

## Milestone 4: Edit Analyzer

Deliver:

- sent reply linkage to AI draft
- deterministic diff
- classification endpoint
- compare view

Exit criteria:

- sent AI-assisted reply produces analysis record
- manager/QA can inspect compare output

## Milestone 5: Dashboards

Deliver:

- manager dashboard
- agent dashboard
- QA dashboard
- trend queries for AI improvement

Exit criteria:

- system can demonstrate measurable AI improvement signals over time

## Milestone 6: Billing and Readiness

Deliver:

- Stripe integration
- plan enforcement foundation
- usage summaries
- onboarding polish

Exit criteria:

- design partner can onboard, use, and be billed on a simple plan model

## Build Order Recommendation

Implement in this order:

1. auth, org, roles
2. core data model and inbox UI
3. email ingest and reply send
4. AI draft generation
5. sent reply linkage
6. diff and edit analysis
7. dashboards
8. billing
9. SMS support

## Known Technical Risks

### Email Threading Complexity

Mitigation:

- support provider thread IDs and email header fallback
- keep manual merge/split out of V1 unless pain forces it

### AI Output Drift

Mitigation:

- enforce structured response schemas
- store prompt version and provider metadata

### Knowledge Quality Problems

Mitigation:

- chunk conservatively
- cap retrieved context
- show internal debug source references

### Dashboard Trustworthiness

Mitigation:

- derive core metrics from stored events, not client behavior
- avoid speculative metrics that cannot be explained

## Definition of Done for V1

V1 is ready for a design partner when:

- inbound email reliably creates or updates conversations
- agents can view customer context and send replies manually
- AI can generate drafts with confidence and risk signals
- AI draft versus final reply can be compared and analyzed
- managers can see measurable AI improvement trends
- org-scoped billing and usage tracking exist in a basic usable form

## Immediate Next Technical Artifact

The next useful document after this spec is either:

- a Supabase schema and migration plan
- an API contract sheet with exact TypeScript types
- a milestone-by-milestone implementation checklist
