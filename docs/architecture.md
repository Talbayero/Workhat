# Architecture

Work Hat CRM is an AI-first operations CRM for customer support and BPO teams. This document describes the system as it exists — not as it was planned.

---

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) | TypeScript throughout |
| UI | React 19 + Tailwind CSS v4 + shadcn/ui | No CSS-in-JS |
| Database | Supabase (PostgreSQL 15) | pgvector, pgcrypto, citext, pg_trgm extensions |
| Auth | Supabase Auth | Email/password + Google OAuth (Gmail scope) |
| Storage | Supabase Storage | Not yet heavily used in V1 |
| AI | OpenAI Chat Completions (GPT-4o) | Provider-abstracted via `lib/ai/` |
| Email | Provider-neutral inbound pipeline + mailbox connection model | OAuth/xOAuth, mailbox password, app password, and IMAP/SMTP setup in UI; custom inbound webhook is advanced; Gmail OAuth/Pub/Sub remains the active Gmail adapter |
| Billing | Stripe | Checkout Sessions + Webhooks, no SDK |
| Hosting | Vercel (assumed) | Edge proxy, cron jobs |
| i18n | Custom dictionary loader | English + Spanish (`en`, `es`) |

---

## Runtime Shape

The application is a single Next.js deployment with three distinct execution contexts:

**Browser** — React components (client components marked `"use client"`). Handles UI interactions, optimistic updates, and form state. Calls the app's own API routes for all data.

**Node.js (server components + API routes)** — The bulk of business logic. Server components fetch data directly from Supabase using the server client. API route handlers (`route.ts` files) handle mutations, AI calls, email operations, and webhook ingestion. The Supabase admin client is only used here.

**Next.js Proxy (edge runtime)** — Runs on every request before it reaches any route. Handles the API gateway (Redis-backed rate limiting, IP blacklisting, body-size caps), session cookie refresh, and auth-based routing (unauthenticated redirect, post-login redirect).

---

## Main Surfaces

### Authenticated Application

| Route | Purpose |
|---|---|
| `/inbox` | Conversation list with filters (status, assignee, channel) |
| `/queue` | SLA-aware queue health, backlog pressure, aging buckets, and operational filters |
| `/inbox/[conversationId]` | Message thread + AI draft composer + reply sender |
| `/contacts` / `/contacts/[id]` | Contact directory and detail |
| `/companies` / `/companies/[id]` | Company directory and detail |
| `/dashboard` | Role-conditional dashboards (agent, manager, QA reviewer) |
| `/knowledge` / `/knowledge/[id]` | SOP/FAQ knowledge base editor |
| `/search` | Global search across conversations, contacts, companies |
| `/audit` | Admin/manager audit trail for critical system and operational events |
| `/settings` | Org config, channel setup, team management, billing |
| `/onboarding` | Post-signup setup flow |

### Public / Marketing

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/[lang]` | i18n landing (en, es) |
| `/[lang]/pricing` | Pricing page |
| `/[lang]/compare` | Edit Analyzer public demo |
| `/login` | Auth form |
| `/demo/*` | Full demo environment — all app sections, no auth required |

### Webhooks & Callbacks

| Route | Purpose |
|---|---|
| `/api/inbound/email` | Public webhook for custom/non-Gmail inbound email sources |
| `/api/email/gmail/push` | Google Cloud Pub/Sub push endpoint |
| `/api/email/gmail/callback` | Gmail OAuth redirect handler |
| `/api/stripe/webhook` | Stripe billing event handler |
| `/auth/callback` | Supabase auth redirect handler |

---

## Data Model

All business tables carry `org_id` for multi-tenant isolation. Every row is scoped to one organization.

### Core Entities

**organizations** — Top-level tenant. Has `crm_plan` and `ai_plan` columns (not `plan_type`). Billing state lives here.

**users** — App users. Has both `id` (internal uuid) and `auth_user_id` (FK to `auth.users`). Role is stored here as a compatibility preset: `admin | manager | agent | qa_reviewer`.

**role_capabilities** — Global mapping from compatibility roles to internal authorization capabilities.

**user_capability_overrides** — Optional org-scoped per-user grants/revokes layered over the role preset.

**companies** — Customer companies (B2B accounts). Scoped to org.

**contacts** — Individual people. Each contact can link to a company. Email stored as `citext` for case-insensitive matching.

**channels** — Configured email/communication channels for an org. Custom inbound channels store one-way webhook token hashes and diagnostics in `config_json`.

**email_connections** — Stores mailbox connection records. `provider` is the actual mailbox provider or adapter family (`gmail`, `microsoft365`, `outlook`, `exchange`, `zoho`, `icloud`, `custom`, `custom_inbound`). `connection_type` is the setup/authentication type (`oauth`, `mailbox_password`, `app_password`, `imap_smtp`, `custom_inbound`). Gmail rows hold OAuth tokens (AES-256-GCM encrypted), watch state, and sync history. Credential-based setup rows hold encrypted credentials plus non-secret adapter metadata such as provider hints, hostnames, ports, TLS flags, sender name, and setup audit fields.

**inbound_email_events** — Org-scoped webhook/import delivery log used for non-Gmail and normalized Gmail inbound processing. Stores provider identifiers, dedupe key, processing status, conversation/message links, and error diagnostics.

### Conversation & Messaging

**conversations** — The central entity. Has `status` (open / closed / waiting_on_customer / waiting_on_internal), `risk_level` (green / yellow / red), and `ai_confidence`. Linked to a contact, company, and channel.

Conversation rows also store the current SLA snapshot (`sla_status`, `sla_target`, `sla_due_at`, `sla_breached_at`, first/next response timestamps). These fields are derived from message history by `lib/sla/` and used for fast queue filters.

**messages** — Individual messages within a conversation. Has `direction` (inbound / outbound / internal) and `sender_type`. Internal notes are messages with direction=internal.

### SLA & Queue Health

**org_sla_policies** — One org-level policy for deterministic response targets. Stores first-response minutes, next-response minutes, at-risk threshold, enabled state, and reserved business-hours JSON.

The SLA evaluator runs after message writes and from an hourly cron at `/api/sla/refresh`. It emits `sla.breached` workflow events only when a conversation transitions into breach. Queue health reads stored conversation snapshots and surfaces active backlog, aging buckets, SLA pressure, risk, assignee, status, channel, and intent filters.

### AI

**ai_drafts** — Every draft generated. Records the provider, model, `prompt_version` (non-null — required for auditability), token counts, and the structured output (draftText, confidenceLevel, riskFlags, rationale).

**sent_replies** — Records of replies actually sent. Linked to the message and the draft (if AI-generated).

**edit_analyses** — What the agent changed from the draft. Stores diff metrics (edit_distance_score, change_percent) and the LLM-classified edit categories (tone / policy / missing_context / factual / structure / full_rewrite).

### AI Improvement Engine

The dashboard reads the last 90 days of `edit_analyses` joined to `ai_drafts` and `conversations` to compare performance by `prompt_version`, cluster repeated edit patterns, identify likely knowledge gaps, and recommend active `knowledge_entries` for review.

V1 computes these insights at read time through deterministic helpers in `lib/ai-improvement-engine/`. Recommendations include edit-analysis evidence IDs and never modify prompts or knowledge automatically.

### Prompt Experimentation

**ai_prompt_versions** — Org-scoped prompt version keys with small optional prompt config (`systemAppend`, `userAppend`, `temperature`). The base prompt and JSON schema remain in code.

**ai_prompt_experiments** — Controlled rollout definitions with status, deterministic traffic seed, stable version, and rollback version.

**ai_prompt_experiment_variants** — Weighted prompt variants for an experiment.

**ai_prompt_assignments** — Sticky conversation-level assignment records. The draft pipeline assigns a version before generation, persists the assignment, stores the selected version in `ai_drafts.prompt_version`, and links the assignment to the draft row.

Prompt assignment is deterministic, org-scoped, and auditable. Rollback sets an experiment to `rolled_back`, causing new drafts to use `rollback_version_key` immediately.

### Knowledge

**knowledge_entries** — SOPs, FAQs, and tone guides. Has `is_active` for soft-delete and `used_in_drafts` counter.

**knowledge_chunks** — Segmented entries with full-text TSVector index (`content_tsv`). Embedding column added in migration 0012 for pgvector (V2 retrieval).

### Classification

**intents** — Classification rules with keywords and priority weights. Used for auto-routing.

**user_skills** — Per-agent capabilities and training flags.

**intent_corrections** — Coaching records when an agent corrects a classification.

### QA & Billing

**qa_reviews** — Quality review records with scores and categories.

**usage_events** — Metered AI action events (what customers see on their plan).

**billing_subscriptions** — Stripe subscription state per org (`provider_customer_id`, `subscription_id`).

**audit_logs** — Append-only event log for security, billing, team, data, AI, and operational actions with attribution. The admin-facing `/audit` route reads this table through `lib/audit/audit-trail.ts`.

### Workflow Engine

**workflow_events** — Org-scoped operational event log for automation. Events include `conversation.created`, `message.received`, `draft.generated`, `reply.sent`, `conversation.updated`, `risk.changed`, and `sla.breached`.

**workflow_rules** — Enabled/disabled deterministic rules with JSON conditions and an ordered allowlist of actions. Rules are evaluated by `lib/workflow-engine/`, not by database triggers.

**workflow_rule_executions** and **workflow_action_executions** — Auditable execution history for every matched/skipped rule and every attempted action.

**qa_follow_ups**, **workflow_notifications**, and **knowledge_gap_candidates** — Lightweight action target tables used by workflow actions without introducing a full task/workflow builder.

Design constraints:

- The engine is event-driven but not recursive in V2. Rule actions do not automatically emit new workflow events.
- Conditions are deterministic comparisons against event payload and conversation context.
- Actions are fixed TypeScript implementations, not arbitrary code or AI behavior.
- `audit_logs` remains the compliance/security log; workflow execution tables are the operational automation log.

### Supporting

**waitlist_signups** — Landing page captures before account creation.

### Key Enums

```sql
user_role:            admin | manager | agent | qa_reviewer
conversation_status:  open | closed | waiting_on_customer | waiting_on_internal
risk_level:           green | yellow | red   -- used for both ai_confidence and risk_level
sender_type:          (customer | agent | system)
message_direction:    inbound | outbound | internal
```

### Schema Conventions

- IDs: `uuid primary key default gen_random_uuid()`
- Timestamps: `created_at timestamptz default now()` + `updated_at timestamptz` (trigger-maintained)
- Emails: `citext` for case-insensitive matching
- Multi-tenancy: every business table has `org_id uuid not null references organizations(id) on delete cascade`
- Audit accountability: `on delete restrict` on user-attributed records (sent_replies, edit_analyses)

---

## Auth & Access

### Authentication

Supabase Auth handles session management. The server-side client uses `@supabase/ssr` to read and refresh cookies on each request.

Auth flows:
- Email + password signup/login (standard Supabase)
- Google OAuth — used exclusively for Gmail API access (not as a login method in its own right). Tokens are stored encrypted in `email_connections`, not in Supabase Auth.

Session validation in `proxy.ts` uses `supabase.auth.getUser()` — this validates the JWT against the Supabase server on every protected request, not just locally.

### Authorization (Compatibility RBAC + Capabilities)

Four roles remain visible to users and are still stored on `users.role`, but internally those roles now map to capabilities. API routes should authorize against capabilities through `lib/auth/capabilities.ts`; legacy role checks are compatibility behavior, not the long-term authorization model.

| Role | What they can do |
|---|---|
| `admin` | Full org config, billing, user management, all operational access |
| `manager` | Dashboards, team oversight, QA queue, all inbox access |
| `agent` | Inbox work — read conversations, generate drafts, send replies |
| `qa_reviewer` | Compare view, edit analysis review, coaching |

Core capabilities:

| Capability | Purpose |
|---|---|
| `conversations.read` | View org conversations and thread context |
| `conversations.reply` | Send or log customer replies |
| `conversations.assign` | Change ownership, assignment, priority, or routing state |
| `records.manage` | Delete customer records such as contacts and companies |
| `ai.generate` | Generate AI drafts and other metered AI outputs |
| `ai.configure` | Configure intent/routing/AI behavior |
| `knowledge.read` | Read SOP/FAQ/tone knowledge |
| `knowledge.edit` | Create, update, rewrite, or retire knowledge |
| `qa.review` | Submit QA reviews and inspect edit-analysis coaching views |
| `settings.manage` | Manage organization-level settings |
| `billing.manage` | Start checkout and manage billing state |
| `integrations.manage` | Connect, disconnect, sync, or configure email integrations and inbound channels |
| `team.manage` | Change roles or remove users |
| `team.invite` | Invite team members without granting full role-management power |
| `team.skills.manage` | Update agent routing skills without full team-admin rights |
| `audit.read` | Read audit logs |

Capability resolution order:

1. Resolve the signed-in user with `getCurrentAppUser()`.
2. Load role grants from `role_capabilities`.
3. Apply `user_capability_overrides` for the same `org_id` and `user_id`.
4. Fall back to built-in TypeScript role presets if the capability migration has not been applied yet.

RLS policies exist in the database for defense-in-depth, and migration `0030_capability_authorization.sql` adds `current_user_has_capability(text)` for future RLS checks. App-layer capability checks remain the primary enforcement mechanism.

### Supabase Client Scoping

Three client variants, each used in specific contexts:

**`lib/supabase/server.ts`** — Server components and API routes. Uses the user's session cookie. Subject to RLS. Use for all normal data access.

**`lib/supabase/client.ts`** — Browser only (`"use client"` components). Session is persisted in cookies, detected from URL on OAuth callbacks.

**`lib/supabase/admin.ts`** — Bypasses RLS entirely. Used only in trusted server contexts: API routes that handle system-level writes (onboarding bootstrap, webhook processing, cron jobs). Requires `SUPABASE_SERVICE_ROLE_KEY`.

---

## Supabase Usage

### Migrations

Numbered migrations in `supabase/migrations/` follow `NNNN_<description>.sql`. Migration numbers are the source of truth for schema history. The archived `docs/archive/planning/supabase-schema-migration-plan.md` file is historical context — the migrations themselves are authoritative.

Apply with: `supabase db push` (or `supabase migration up` against a local instance).

### Row Level Security

RLS is enabled on all business tables. The `org_id` scoping pattern is:

```sql
create policy "org_isolation" on conversations
  for all using (org_id = (select org_id from users where auth_user_id = auth.uid()));
```

The admin client bypasses RLS — never use it in user-facing contexts.

### Extensions Used

| Extension | Purpose |
|---|---|
| `pgcrypto` | `gen_random_uuid()`, encryption helpers |
| `citext` | Case-insensitive text (email fields) |
| `pg_trgm` | Trigram indexes for fuzzy search |
| `pgvector` | Vector similarity search (embeddings, V2) |

---

## Integrations

### Email Inbound

Inbound email is normalized before it touches conversation domain logic. `lib/email-connector/inbound.ts` defines the provider-neutral message shape: provider name, external message/thread ids, headers, sender, recipients, subject, text/html body, received timestamp, and metadata.

The public custom webhook route is `POST /api/inbound/email`. It verifies a per-channel shared token, validates and normalizes the JSON payload, resolves the org/channel by `channelId` or configured recipient address, records an `inbound_email_events` row for idempotency/diagnostics, then creates or updates contacts, companies, conversations, messages, SLA snapshots, and workflow events.

Supported V1 payloads are intentionally generic and Postmark-compatible enough for internal relays, SMTP parsing services, and future Postmark-style providers. The route is not a visual marketplace or arbitrary integration runtime.

Onboarding and Settings present mailbox setup in four buyer-friendly choices: OAuth/xOAuth, mailbox login and password, app password, and IMAP/SMTP. Custom inbound remains available under Advanced developer setup for relays, webhook parsers, and internal demo senders.

Downstream effects after successful inbound processing:

- `conversation.created` for a new thread, or `conversation.updated` when an existing thread receives a message.
- `message.received` exactly once per deduped delivery.
- `risk.changed` when an existing conversation escalates to red risk.
- SLA refresh through `lib/sla/refresh` so queue health remains current.

### Gmail

Work Hat connects to Gmail via OAuth 2.0. Each org can connect one or more Gmail accounts via `/api/email/gmail/connect` → `/api/email/gmail/callback`.

Token and credential storage: Gmail access/refresh tokens and saved mailbox/app-password/IMAP credentials are encrypted with AES-256-GCM (`lib/email-connector/encryption.ts`) before being written to `email_connections`. The encryption key is `EMAIL_TOKEN_ENCRYPTION_KEY` (32-byte base64). Custom inbound webhook tokens do not use this key because only one-way token hashes are stored.

Real-time sync: Google Cloud Pub/Sub pushes new message notifications to `/api/email/gmail/push`. The watch is set up via `/api/email/gmail/watch` and renewed by a cron job at `/api/email/gmail/renew-watches` (requires `CRON_SECRET` header for Vercel Cron authorization).

Inbound processing: `lib/email-connector/gmail-importer.ts` is now a Gmail adapter. It fetches Gmail payloads, normalizes them into the same inbound message shape used by custom webhook sources, and calls the shared inbound processor. Threading still uses Gmail `threadId` plus standard `In-Reply-To` / `References` headers.

Outbound: `lib/email-connector/gmail-sender.ts` sends replies via the Gmail API using the connected account's OAuth token.

### OpenAI

AI calls go through `lib/ai/index.ts` which exposes a single `generateDraft(options)` function. The underlying provider is `lib/ai/providers/openai.ts`.

Draft generation uses structured JSON output (`response_format: { type: "json_schema" }`). The schema is validated at runtime in `lib/ai/schemas/draft.ts`. No Zod — plain JSON Schema validation.

The prompt is assembled in 5 layers by `lib/ai/prompts/draft.ts`: (1) system behavior, (2) org policy and tone from knowledge entries, (3) top-k knowledge snippets, (4) thread context, (5) output schema instructions.

A circuit breaker (`lib/security/circuit-breaker.ts`) wraps all OpenAI calls: fails open after 5 consecutive failures, 30-second cooldown.

Model is configurable via `OPENAI_MODEL` (default: `gpt-4o`).

### Stripe

Billing uses Stripe Checkout Sessions. The integration is implemented without the Stripe Node SDK — direct REST API calls + HMAC-SHA256 webhook signature verification in `lib/stripe.ts`.

Webhook handler at `/api/stripe/webhook` processes subscription lifecycle events and updates `billing_subscriptions` and `organizations` accordingly.

Customers see "AI Actions" as their usage metric, not tokens.

### Edit Analysis

`lib/edit-analysis.ts` runs a deterministic diff between the AI draft and what the agent actually sent. It computes `edit_distance_score`, `change_percent`, and `similarity`. This data is stored in `edit_analyses` alongside LLM-based edit classification (tone, policy, missing_context, factual, structure, full_rewrite).

Rule: deterministic diff always runs first. LLM classification is only invoked when the diff indicates a meaningful edit.

### Audit Trail

The `/audit` route is the operational audit monitor for admins and managers. It is server-rendered, checks the `audit.read` capability at the route level, and calls `lib/audit/audit-trail.ts` for all data access.

Supported filters:

| Filter | Behavior |
|---|---|
| Actor | Matches `actor_id` when a UUID is supplied; otherwise searches `actor_email` |
| Action | Exact match on `audit_logs.action` |
| Entity type | Exact match on `resource_type` |
| Entity id | Exact UUID match on `resource_id` |
| Date range | Inclusive created-at range |
| Org scope | Locked to the signed-in user's `org_id`; user-supplied org IDs cannot expand scope |

Results are ordered by `created_at desc, id desc` for stable pagination. The UI shows event severity, actor, resource, request metadata, and before/after JSON deltas when present.

### API Gateway & Rate Limiting

`lib/security/api-gateway.ts` protects all `/api/*` traffic from `proxy.ts`. Rate counters and dynamic blacklist entries are stored in Upstash Redis, not process memory, so limits survive Vercel cold starts and scale across function instances.

The gateway runs in two phases:

1. **Pre-auth phase** — static blacklist, suspicious proxy headers, HTTP method checks, body-size limits, and IP-based limits for public/trusted routes such as waitlist, inbound email, Gmail push, and Stripe webhook.
2. **Post-auth phase** — user-aware limits after Supabase has verified the session. Authenticated route groups use user identity when available and fall back to IP for unauthenticated API callers. The policy model also supports org identity when a caller passes `orgId`.

Route policy groups:

| Policy | Routes | Identity | Default |
|---|---|---|---|
| `public-waitlist` | `/api/waitlist` | IP | 8/min |
| `inbound-email-webhook` | `/api/inbound/email` | IP, trusted system | 120/min |
| `gmail-push-webhook` | `/api/email/gmail/push` | IP, trusted system | 240/min |
| `stripe-webhook` | `/api/stripe/webhook` | IP, trusted system | 120/min |
| `onboarding-create-org` | `/api/org/create` | User/IP | 8/min |
| `expensive-ai` | `/api/ai/*`, AI-backed knowledge/intent routes | Org/user/IP | 30/min |
| `knowledge-gaps` | `/api/knowledge/gaps` | Org/user/IP | 6/min |
| `email-connector` | `/api/email/*` except Gmail push | User/IP | 60/min |
| `api-default` | Remaining API routes | User/IP | 180/min |

Trusted system webhooks are rate limited but do not trigger dynamic blacklisting. This avoids accidentally blocking Stripe, Gmail Pub/Sub, or inbound email providers during retry storms. When Redis is missing or unavailable, production API traffic generally fails closed with `rate_limit_store_unavailable`; local development, trusted webhooks, and the authenticated onboarding org-creation route fail open after method/body/static blacklist checks so first-run setup is not blocked by a transient rate-limit store outage.

---

## Environment Variables

### Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Must begin with sb_secret_... (new format) or legacy JWT

# Gmail OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EMAIL_TOKEN_ENCRYPTION_KEY=         # openssl rand -base64 32; required for Gmail OAuth tokens and saved mailbox credentials
GOOGLE_PUBSUB_TOPIC=                # projects/{id}/topics/{name}

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o                 # Configurable

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_ANNUAL=
STRIPE_PRICE_SCALE_MONTHLY=
STRIPE_PRICE_SCALE_ANNUAL=

# App
NEXT_PUBLIC_APP_URL=https://work-hat.com
```

### Optional / Operational

```bash
# Cron auth (Vercel Cron)
CRON_SECRET=

# Gmail push webhook auth (shared secret)
GMAIL_PUSH_TOKEN=

# Custom inbound email channels
# Per-channel webhook tokens are generated in Settings -> Channels and stored as one-way hashes.
# POSTMARK_INBOUND_TOKEN remains as a legacy fallback only for old webhook setups without per-channel secrets.


# Security
SECURITY_IP_BLACKLIST=              # Comma-separated IP list
SECURITY_DYNAMIC_BLACKLIST_TTL_MS=
UPSTASH_REDIS_REST_URL=             # Required for production API rate limiting
UPSTASH_REDIS_REST_TOKEN=           # Required for production API rate limiting
SECURITY_RATE_LIMIT_FAIL_OPEN=      # Optional. Default: false in production, true locally/trusted webhooks
SECURITY_RATE_LIMIT_KEY_PREFIX=     # Optional Redis key namespace, default workhat:rate:v1
TURNSTILE_SECRET_KEY=               # Cloudflare Turnstile for forms

# Optional per-policy overrides
# SECURITY_RATE_LIMIT_<POLICY_ID>_WINDOW_MS=
# SECURITY_RATE_LIMIT_<POLICY_ID>_MAX_REQUESTS=
# SECURITY_RATE_LIMIT_<POLICY_ID>_BLACKLIST_AFTER=
#
# Example:
# SECURITY_RATE_LIMIT_EXPENSIVE_AI_MAX_REQUESTS=20

# Legacy / compatibility
POSTMARK_SERVER_TOKEN=
POSTMARK_INBOUND_TOKEN=
RESEND_API_KEY=
```

---

## Verification Notes

**The repo root README is intentionally short.** Active platform documentation is centralized in `docs/README.md`.

**pgvector is installed but not the primary retrieval path.** Migration 0012 added the extension and embedding column to `knowledge_chunks`. In V1, retrieval uses Postgres full-text search (`content_tsv` TSVector). Semantic search via pgvector is planned for V2.

**PWA is not implemented.** The app has favicons and an apple-icon but no `manifest.json` or service worker. Push notifications (browser-native) are not wired up; real-time sync is handled server-side via Gmail Pub/Sub.

**Postmark/Resend env vars are compatibility only.** Custom inbound email does not require Postmark or Resend. `POSTMARK_INBOUND_TOKEN` only supports legacy webhook setups when a channel does not have a per-channel token.

**Demo routes serve mock data from `lib/mock-data.ts`** (44 KB). They require no authentication and are used for sales demos and manual QA.

*Last updated: April 2026*
