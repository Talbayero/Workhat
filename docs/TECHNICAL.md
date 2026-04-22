# Work Hat CRM — Technical Documentation

> This document covers the architecture, API surface, database schema, security model, and deployment guide for Work Hat CRM.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Authentication and multi-tenancy](#2-authentication-and-multi-tenancy)
3. [Database schema](#3-database-schema)
4. [API reference](#4-api-reference)
5. [AI layer](#5-ai-layer)
6. [Gmail integration](#6-gmail-integration)
7. [Email inbound pipeline](#7-email-inbound-pipeline)
8. [Knowledge base and vector search](#8-knowledge-base-and-vector-search)
9. [Billing (Stripe)](#9-billing-stripe)
10. [Security model](#10-security-model)
11. [Deployment](#11-deployment)
12. [Development guide](#12-development-guide)

---

## 1. Architecture overview

Work Hat CRM is a Next.js 16 App Router application deployed to Vercel with Supabase as its database and auth backend.

```
Browser / Mobile
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js on Vercel Edge / Node.js runtime                   │
│                                                             │
│  middleware.ts                                              │
│    │─ API gateway (rate limits, IP blacklist, body caps)    │
│    │─ Session refresh (Supabase cookie reissue)             │
│    └─ Auth routing (401/redirect for protected routes)      │
│                                                             │
│  App Router pages (Server Components)                       │
│  API Route Handlers (src/app/api/**/route.ts)               │
└──────────────┬──────────────────────────────────────────────┘
               │
     ┌─────────┴──────────┐
     │                    │
     ▼                    ▼
Supabase             OpenAI API
  Postgres             GPT-4o (drafts)
  Auth                 text-embedding-3-small (vectors)
  Row Level Security
     │
     ▼
Gmail API          Postmark (inbound webhook)
Pub/Sub            Resend (outbound email)
     │
     ▼
Stripe (billing)
```

### Request lifecycle

1. Every request hits `middleware.ts` first.
2. The API gateway runs rate limiting and IP blacklist checks.
3. Supabase refreshes the session cookie if it is about to expire.
4. Auth routing checks whether the route is public or protected.
5. The matching Route Handler executes and returns a JSON response.

---

## 2. Authentication and multi-tenancy

### Auth provider

Supabase Auth with magic link (passwordless email). There is no password flow.

### App user resolution

Supabase Auth users (`auth.users`) are separate from application users (`public.users`). The `getCurrentAppUser()` helper in `src/lib/auth/app-user.ts` resolves the signed-in Supabase user to the application user row and returns `{ id, org_id, role }`.

The helper first tries the RLS-enforced Supabase client. If that fails (e.g. the RLS policy blocks the self-lookup), it falls back to the service role admin client. This makes protected API routes resilient to RLS policy changes during development.

### Roles

| Role | Permissions |
|---|---|
| `admin` | Full access including Gmail watch, sync, diagnostics, billing, team management |
| `manager` | Same as admin for most operations |
| `agent` | Read inbox, create/update conversations, generate AI drafts, send replies |
| `qa_reviewer` | Submit QA reviews |

### Multi-tenancy

Every business table carries an `org_id` UUID column. Supabase Row Level Security policies enforce that users can only read and write rows belonging to their organization. The API layer adds an explicit `.eq("org_id", appUser.org_id)` filter on every database query as a defense-in-depth measure against IDOR vulnerabilities.

---

## 3. Database schema

The database lives in Supabase (Postgres). There are 16 migrations in `supabase/migrations/` (files `0001` through `0016`).

### Core tables

#### `organizations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | Organization display name |
| `crm_plan` | enum | `starter`, `pro`, `scale`, `enterprise` |
| `ai_plan` | enum | AI usage tier |
| `created_at` | timestamptz | |

#### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | App-level user ID |
| `auth_user_id` | uuid | Maps to `auth.users.id` |
| `org_id` | uuid FK | Parent organization |
| `role` | user_role enum | `admin`, `manager`, `agent`, `qa_reviewer` |
| `full_name` | text | |
| `email` | citext | Case-insensitive unique |

#### `contacts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid FK | |
| `email` | citext | |
| `full_name` | text | |
| `phone` | text | |
| `notes` | text | Free text; capped at 2,000 chars in API |
| `tags` | text[] | Up to 20 tags, 50 chars each |
| `company_id` | uuid FK | Optional |

#### `companies`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid FK | |
| `name` | text | |
| `industry` | text | |
| `account_owner` | text | |
| `notes` | text | |
| `tags` | text[] | |

#### `conversations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid FK | |
| `contact_id` | uuid FK | |
| `company_id` | uuid FK | |
| `subject` | text | |
| `status` | conversation_status enum | `open`, `waiting_on_customer`, `waiting_on_internal`, `resolved`, `archived` |
| `risk_level` | risk_level enum | `green`, `yellow`, `red` |
| `ai_confidence` | risk_level enum | AI's confidence in its own classification |
| `intent` | text | AI-classified intent (e.g. `billing`, `support`) |
| `assigned_to_name` | text | Agent name string |
| `tags` | text[] | |
| `last_message_at` | timestamptz | |

#### `messages`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `conversation_id` | uuid FK | |
| `org_id` | uuid FK | |
| `sender_type` | sender_type enum | `customer`, `agent`, `ai`, `internal` |
| `direction` | message_direction enum | `inbound`, `outbound` |
| `body_text` | text | Plain text body |
| `body_html` | text | HTML body (optional) |
| `sent_at` | timestamptz | |
| `postmark_message_id` | text | Deduplication key |

#### `ai_drafts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `conversation_id` | uuid FK | |
| `org_id` | uuid FK | |
| `draft_text` | text | The generated reply draft |
| `rationale` | text | AI's reasoning |
| `suggestions` | text[] | Improvement suggestions |
| `missing_context` | text[] | What the AI couldn't find |
| `provider` | text | `openai` |
| `model` | text | e.g. `gpt-4o` |
| `prompt_version` | text NOT NULL | e.g. `v1.0` |
| `request_tokens` | int | |
| `response_tokens` | int | |
| `latency_ms` | int | |

#### `knowledge_entries`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid FK | |
| `title` | text | |
| `body` | text | Full content |
| `category` | text | e.g. `faq`, `tone_guide`, `sop` |
| `tags` | text[] | |
| `active` | boolean | Inactive entries excluded from retrieval |

#### `knowledge_chunks`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `entry_id` | uuid FK | |
| `org_id` | uuid FK | |
| `chunk_text` | text | 600-char paragraph chunks |
| `embedding` | vector(1536) | Generated by `text-embedding-3-small` |

#### `email_connections`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `org_id` | uuid FK | |
| `provider` | text | `gmail` |
| `provider_account_email` | text | Connected Gmail address |
| `access_token_ciphertext` | text | AES-256-GCM encrypted |
| `refresh_token_ciphertext` | text | AES-256-GCM encrypted |
| `token_expires_at` | timestamptz | |
| `status` | text | `connected`, `error`, `disconnected` |
| `sync_status` | text | `idle`, `syncing`, `watching`, `error` |
| `last_history_id` | text | Gmail history cursor |
| `watch_expires_at` | timestamptz | Gmail watch subscription expiry |
| `provider_metadata` | jsonb | Stores Pub/Sub topic, registration time |

#### `billing_subscriptions`

Stores Stripe subscription state per organization: `stripe_customer_id`, `stripe_subscription_id`, `plan`, `status`, `current_period_end`.

### Key enums

| Enum | Values |
|---|---|
| `user_role` | `admin`, `manager`, `agent`, `qa_reviewer` |
| `conversation_status` | `open`, `closed`, `waiting_on_customer`, `waiting_on_internal`, `resolved`, `archived` |
| `risk_level` | `green`, `yellow`, `red` |
| `sender_type` | `customer`, `agent`, `ai`, `internal` |
| `message_direction` | `inbound`, `outbound` |

---

## 4. API reference

All API routes live under `src/app/api/`. Unless noted, all routes require a valid session cookie and return `401` if unauthenticated.

### Conversations

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/conversations` | agent+ | List conversations for org with filtering |
| `POST` | `/api/conversations` | agent+ | Create a new conversation manually |
| `GET` | `/api/conversations/[id]` | agent+ | Get conversation detail with messages |
| `PATCH` | `/api/conversations/[id]` | agent+ | Update status, intent, tags, assigned_to |
| `GET` | `/api/conversations/count` | agent+ | Count conversations by status |

### Contacts

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/contacts` | agent+ | List contacts for org |
| `POST` | `/api/contacts` | agent+ | Create contact |
| `GET` | `/api/contacts/[id]` | agent+ | Get contact with linked conversations |
| `PATCH` | `/api/contacts/[id]` | agent+ | Update contact fields |
| `DELETE` | `/api/contacts/[id]` | admin/manager | Delete contact |

### Companies

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/companies` | agent+ | List companies for org |
| `POST` | `/api/companies` | agent+ | Create company |
| `GET` | `/api/companies/[id]` | agent+ | Get company |
| `PATCH` | `/api/companies/[id]` | agent+ | Update company |
| `DELETE` | `/api/companies/[id]` | admin/manager | Delete company |

### AI

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/ai/draft` | agent+ | Generate an AI reply draft for a conversation |

**Request body:**
```json
{ "conversationId": "<uuid>", "sourceMessageId": "<uuid>" }
```

**Response:**
```json
{
  "draft": {
    "id": "<uuid>",
    "draftText": "...",
    "rationale": "...",
    "suggestions": ["..."],
    "missingContext": ["..."],
    "provider": "openai",
    "model": "gpt-4o",
    "promptVersion": "v1.0",
    "latencyMs": 1234
  }
}
```

### Knowledge base

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/knowledge` | agent+ | List knowledge entries |
| `POST` | `/api/knowledge` | admin/manager | Create entry (auto-chunks + embeds) |
| `GET` | `/api/knowledge/[id]` | agent+ | Get entry |
| `PATCH` | `/api/knowledge/[id]` | admin/manager | Update entry (re-chunks + re-embeds) |
| `DELETE` | `/api/knowledge/[id]` | admin/manager | Delete entry and its chunks |
| `GET` | `/api/knowledge/gaps` | admin/manager | AI-identified knowledge gaps |
| `POST` | `/api/knowledge/rewrite` | admin/manager | AI rewrite of an entry |
| `POST` | `/api/knowledge/from-edit` | admin/manager | Create entry from an edit analysis |

### Intents

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/intents` | agent+ | List configured intents |
| `POST` | `/api/intents` | admin/manager | Create intent |
| `PATCH` | `/api/intents/[id]` | admin/manager | Update intent |
| `DELETE` | `/api/intents/[id]` | admin/manager | Delete intent |

### QA Reviews

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/qa-reviews` | qa_reviewer+ | Submit a QA review for a conversation |

### Search

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/search` | agent+ | Full-text search across conversations, contacts, companies |

### Audit Trail

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/audit-logs` | admin/manager (`audit.read`) | Paginated, org-scoped audit log query with actor/action/entity/date filters |

The admin UI for this data is `/audit`. The page and API both call `src/lib/audit/audit-trail.ts` so filtering, pagination, org scoping, and stable ordering stay consistent.

### Settings

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/settings/org` | admin/manager | Get org settings |
| `PATCH` | `/api/settings/org` | admin/manager | Update org name, from_name, channel config |
| `GET` | `/api/settings/team` | admin/manager | List team members |

### Organization

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/org/create` | authenticated | Create an organization for a new user |

### Invitations

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/invite` | admin/manager | Invite a team member by email (rate-limited to 20/day) |

### Gmail

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/email/gmail/connect` | **Public** | Initiate Gmail OAuth flow |
| `GET` | `/api/email/gmail/callback` | **Public** | OAuth callback — exchanges code for tokens |
| `POST` | `/api/email/gmail/push` | **Public** (token-verified) | Pub/Sub push notification receiver |
| `POST` | `/api/email/gmail/sync` | admin/manager | Manual inbox sync |
| `POST` | `/api/email/gmail/watch` | admin/manager | Register a Gmail watch subscription |
| `GET` | `/api/email/gmail/renew-watches` | Cron (Bearer secret) | Renew expiring watch subscriptions |
| `GET` | `/api/email/gmail/diagnostics` | admin/manager | Check Gmail connector configuration |

### Email connections

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/email/connections` | admin/manager | List connected email accounts |
| `DELETE` | `/api/email/connections` | admin/manager | Disconnect an email account |

### Inbound email (Postmark webhook)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/inbound/email` | Token (`X-Inbound-Token`) | Receive and process inbound email from Postmark |

### Billing (Stripe)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/stripe/checkout` | authenticated | Create a Stripe Checkout session |
| `POST` | `/api/stripe/webhook` | Stripe signature | Handle Stripe subscription lifecycle events |

### Waitlist

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/waitlist` | **Public** | Join the waitlist |

---

## 5. AI layer

### Overview

The AI layer is intentionally provider-agnostic. All callers import from `src/lib/ai/index.ts` — never from provider files directly. Swapping from OpenAI to another provider requires changes only within `src/lib/ai/`.

### Draft generation pipeline

`POST /api/ai/draft` follows this sequence:

1. **Authenticate** — resolve app user and verify org membership.
2. **Fetch context** — load the conversation, all its messages, the linked contact and company, and the org's tone/policy knowledge entries.
3. **Semantic retrieval** — generate an embedding of the latest customer message, then query `knowledge_chunks` using pgvector cosine similarity to retrieve the most relevant knowledge snippets.
4. **Assemble `ConversationContext`** — combine messages (capped at 2,000 chars each), contact notes, company info, and retrieved knowledge into a typed context object.
5. **Generate** — call `generateDraft(context)` which calls the OpenAI Chat Completions API with a multi-layer prompt.
6. **Persist** — save the result to `ai_drafts` in a background task (`after()`). If persistence fails, the draft is still returned to the caller.

### Prompt structure

The prompt is built in `src/lib/ai/prompts/draft.ts` in layers:

- **Layer 1 — System prompt**: Core identity and rules (always follow the org, never hallucinate, never auto-send).
- **Layer 2 — Tone and policy**: Retrieved `tone_guide` and `sop` knowledge entries that define the org's specific voice.
- **Layer 3 — Knowledge**: Relevant FAQ and policy chunks retrieved by vector search.
- **Layer 4 — Conversation**: The full message thread with XML delimiters around each message body and contact notes to prevent prompt injection.
- **Layer 5 — Task**: The specific instruction to generate a draft reply.

### Prompt injection defense

User-controlled content (message bodies, contact notes) is wrapped in XML delimiters in the prompt:

```
[Customer — 2024-01-15T10:00:00Z]
<message>
{customer message body}
</message>
```

This prevents injected instructions in message bodies from being interpreted as system-level directives.

### Intent classification

`src/lib/ai/intent-classifier.ts` classifies inbound emails into configured intents (e.g. `billing`, `support`, `escalation`). Each organization can configure custom intents with keywords and required agent skills. When no org context is available yet (first message before org is resolved), a simple regex fallback classifier is used.

### Edit analysis

After an agent edits and sends an AI draft, `src/lib/edit-analysis.ts` analyzes what changed — additions, deletions, tone changes — and stores a structured `edit_analyses` record. These edit patterns feed the knowledge gap detection and future prompt improvement.

---

## 6. Gmail integration

### OAuth flow

```
User clicks "Connect Gmail"
        │
GET /api/email/gmail/connect
  → Generates state nonce → stores in cookie
  → Redirects to Google OAuth consent screen
        │
Google redirects back to:
GET /api/email/gmail/callback?code=...&state=...
  → Validates state cookie (CSRF protection)
  → Exchanges code for access + refresh tokens
  → Encrypts tokens with AES-256-GCM
  → Stores encrypted tokens in email_connections
  → Redirects user to /onboarding?step=inbox
```

### Token storage

OAuth tokens are encrypted at rest using AES-256-GCM before being written to the database. The encryption key is `EMAIL_TOKEN_ENCRYPTION_KEY`. Tokens are decrypted in-memory only when needed for API calls.

### Push notifications (Gmail watch)

Gmail push notifications use Google Cloud Pub/Sub:

1. An admin calls `POST /api/email/gmail/watch` to register a Gmail watch subscription. This tells Gmail to publish a notification to your Pub/Sub topic whenever new mail arrives.
2. Google Pub/Sub delivers notifications to `POST /api/email/gmail/push?token=<GMAIL_PUSH_TOKEN>`.
3. The push endpoint decodes the Pub/Sub message, resolves the connected Gmail account, and calls `importGmailHistory()` to fetch and import the new messages using the Gmail History API.
4. Gmail watch subscriptions expire after approximately 7 days. The Vercel Cron job at `GET /api/email/gmail/renew-watches` (runs daily at 07:00 UTC) renews any watch that expires within 48 hours.

### Manual sync

`POST /api/email/gmail/sync` performs a manual inbox import (most recent 10 messages). Useful for initial setup and troubleshooting.

---

## 7. Email inbound pipeline

Postmark is configured with an inbound domain (e.g. `inbound.work-hat.com`). When an email arrives, Postmark parses it and POSTs the structured payload to `POST /api/inbound/email`.

### Processing steps

1. **Auth** — validates `X-Inbound-Token` header against `POSTMARK_INBOUND_TOKEN`. Missing env var returns 503 (misconfiguration), wrong token returns 401.
2. **Payload sanitization** — Subject is capped at 500 chars; TextBody at 100,000 chars before any processing.
3. **Threading** — checks `In-Reply-To` / `References` headers to find an existing conversation by Postmark message ID.
4. **Contact resolution** — finds or creates a contact record by email address.
5. **Company auto-detection** — if the sender email is a business domain (not Gmail, Yahoo, etc.), looks up or creates a company record from the domain.
6. **Intent classification** — runs the org-configured intent classifier (or the regex fallback) to assign an intent and risk level.
7. **Conversation creation or update** — creates a new conversation or appends a message to an existing thread.
8. **Background processing** — uses `after()` to trigger async tasks (AI draft generation, embeddings) after the response is already sent to Postmark.

---

## 8. Knowledge base and vector search

### Storage model

Each knowledge entry (`knowledge_entries`) is split into paragraph-level chunks (`knowledge_chunks`) of up to 600 characters. Each chunk gets a `text-embedding-3-small` embedding (1,536 dimensions) stored as a `vector` column via the `pgvector` Postgres extension.

### Retrieval at draft time

When generating a draft, the AI route:

1. Takes the latest customer message text.
2. Calls `generateEmbedding()` to get its 1,536-dim vector.
3. Queries `knowledge_chunks` using pgvector cosine similarity: `embedding <=> query_vector`.
4. Returns the top-k most similar chunks to include in the prompt.

### Knowledge gap detection

`GET /api/knowledge/gaps` runs multiple parallel AI calls that analyze recent conversation patterns and edit analyses to identify topics that agents frequently have to correct or supplement. The results surface suggested new knowledge entries.

---

## 9. Billing (Stripe)

### Plans

Four plans are supported: `starter`, `pro`, `scale`, `enterprise`. Each plan has monthly and annual Stripe Price IDs configured via environment variables.

### Checkout flow

1. Authenticated user calls `POST /api/stripe/checkout` with `{ planId, interval }`.
2. The route creates a Stripe Checkout session and returns the session URL.
3. The user completes payment on Stripe's hosted page.
4. Stripe calls `POST /api/stripe/webhook` with `checkout.session.completed`.
5. The webhook handler validates the Stripe signature, extracts the `org_id` from session metadata (validated as a proper UUID), and updates the `billing_subscriptions` table.

### Webhook events handled

| Event | Action |
|---|---|
| `checkout.session.completed` | Activate subscription, set plan |
| `customer.subscription.updated` | Update plan and status |
| `customer.subscription.deleted` | Downgrade to `starter` |

---

## 10. Security model

### Transport security

- HTTPS enforced via Vercel.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` header instructs browsers to always use HTTPS.
- `X-Frame-Options: DENY` prevents clickjacking.
- `X-Content-Type-Options: nosniff` prevents MIME sniffing.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` disables camera, microphone, geolocation.

### Authentication

- All protected routes require a valid Supabase session cookie.
- The middleware layer uses `supabase.auth.getUser()` (validated against the Supabase Auth server) — never `getSession()` (which only reads a local cookie and can be spoofed).
- API routes return `401 JSON` for unauthenticated requests; page routes redirect to `/login?next=<path>`.

### Authorization

- Role checks are enforced in every Route Handler before any DB operation.
- Multi-tenant isolation: all DB queries include an explicit `org_id` filter in addition to RLS policies.
- Mutation queries also filter by `org_id` to prevent IDOR attacks where an attacker submits a known resource ID belonging to a different org.

### Rate limiting

The API gateway (`src/lib/security/api-gateway.ts`) enforces per-route rate limits:

| Route group | Limit | Window |
|---|---|---|
| Inbound email webhook | 120 requests | 1 min |
| Gmail push webhook | 240 requests | 1 min |
| Stripe webhook | 120 requests | 1 min |
| AI routes | 30 requests | 1 min |
| Email connector | 60 requests | 1 min |
| Knowledge gaps | 6 requests | 1 min |
| Public waitlist | 8 requests | 1 min |
| All other API routes | 180 requests | 1 min |

Counters and dynamic blacklist entries are stored in Upstash Redis via `@upstash/redis`, so limits survive Vercel cold starts and coordinate across serverless instances. Authenticated routes are keyed by user when possible and fall back to IP. Trusted system webhooks are rate limited but do not trigger dynamic blacklisting, which prevents retry storms from accidentally blocking Stripe, Gmail Pub/Sub, or inbound email providers.

IPs that exceed the violation threshold are dynamically blacklisted for the configured TTL (default: 15 minutes). A static IP blacklist can be configured via `SECURITY_IP_BLACKLIST`. Production deployments require `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; local development fails open by default unless `SECURITY_RATE_LIMIT_FAIL_OPEN=false`.

### Input validation

- All user-supplied string inputs are validated for type, trimmed, and capped at field-specific maximum lengths before any DB write or LLM call.
- Tag arrays are deduplicated and capped at 20 tags, 50 chars each.
- Free-text fields (notes, message bodies) are capped at 2,000 chars and 100,000 chars respectively.
- The Postmark Subject header is capped at 500 chars before processing.

### Webhook security

- **Postmark inbound**: `POSTMARK_INBOUND_TOKEN` is required. A missing env var returns 503 (misconfiguration), not a silent pass-through.
- **Stripe webhook**: Stripe signature verified with `constructEvent()` before any processing.
- **Gmail push**: `GMAIL_PUSH_TOKEN` required. Delivered as a query parameter (`?token=...`).

### Sensitive data

- Gmail OAuth tokens are encrypted at rest (AES-256-GCM) using `EMAIL_TOKEN_ENCRYPTION_KEY`.
- Error messages returned to API clients are generic. Raw database or provider error details are logged server-side only.
- No internal infrastructure details (table names, stack traces, admin client status) are exposed in API responses.

### Open redirect protection

Login and auth callback pages use a `safeNext()` function that validates the `next` parameter starts with `/` and not `//`, preventing open redirect attacks.

### CRLF injection prevention

The `from_name` field in org channel settings is stripped of `\r\n` characters before being stored or used in email From headers.

---

## 11. Deployment

### Vercel

The app is designed for Vercel deployment. Set all environment variables in the Vercel project dashboard.

**Cron job** (`vercel.json`):

```json
{
  "crons": [
    {
      "path": "/api/email/gmail/renew-watches",
      "schedule": "0 7 * * *"
    }
  ]
}
```

This runs daily at 07:00 UTC. The route is protected by `Authorization: Bearer <CRON_SECRET>` and renews Gmail watch subscriptions expiring within 48 hours.

### Supabase setup

1. Create a Supabase project.
2. Enable the `pgvector` extension: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Run all 16 SQL migration files from `supabase/migrations/` in order (0001 → 0016).
4. Copy the project URL and anon key to your environment variables.
5. Generate a service role key (or use the new `sb_secret_...` format) for `SUPABASE_SERVICE_ROLE_KEY`.

### Google Cloud setup

1. Create a Google Cloud project.
2. Enable the **Gmail API** and **Cloud Pub/Sub API**.
3. Create an OAuth 2.0 Web Client ID. Add your production and development redirect URIs:
   - `https://your-domain.com/api/email/gmail/callback`
   - `http://localhost:3000/api/email/gmail/callback`
4. Create a Pub/Sub topic (e.g. `projects/my-project/topics/gmail-push`).
5. Create a Pub/Sub push subscription that delivers to `https://your-domain.com/api/email/gmail/push?token=<GMAIL_PUSH_TOKEN>`.
6. Grant the Gmail API service account (`gmail-api-push@system.gserviceaccount.com`) the `pubsub.topics.publish` role on your topic.

### Postmark setup

1. Create a Postmark server.
2. Configure an inbound domain (add the MX record to your DNS).
3. Set the inbound webhook URL to `https://your-domain.com/api/inbound/email`.
4. Add a custom header `X-Inbound-Token: <POSTMARK_INBOUND_TOKEN>` to the webhook.

### Stripe setup

1. Create a Stripe account and product with four prices (Pro monthly, Pro annual, Scale monthly, Scale annual).
2. Copy the Price IDs to the corresponding environment variables.
3. Configure a Stripe webhook endpoint: `https://your-domain.com/api/stripe/webhook`.
4. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
5. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`.

---

## 12. Development guide

### Running locally

```bash
cd web
npm install
cp .env.example .env.local   # fill in at minimum Supabase + OpenAI
npm run dev
```

For Gmail and Postmark integration in development, use a tunneling tool like `ngrok` to expose `localhost:3000` to a public URL, then configure webhooks to that URL.

### TypeScript

```bash
npx tsc --noEmit          # type-check without emitting files
```

No `any` types are used in production code. The project uses strict TypeScript throughout.

### Database migrations

Migrations are plain SQL files in `supabase/migrations/`. Run them in the Supabase SQL editor in order. There is no migration runner CLI configured — apply them manually during development.

### Supabase clients

Three Supabase clients are available:

| Client | File | When to use |
|---|---|---|
| Server (RLS) | `lib/supabase/server.ts` | Server Components, Route Handlers that operate on behalf of the signed-in user |
| Browser | `lib/supabase/client.ts` | Client Components (auth state, realtime) |
| Admin | `lib/supabase/admin.ts` | Server-only operations that bypass RLS (sync, webhook processing). Throws if `SUPABASE_SERVICE_ROLE_KEY` is not set. |

`createOptionalAdminClient()` is an admin client variant that returns `{ client: null, reason: string }` instead of throwing, for use in diagnostic checks where graceful degradation is appropriate.

### Adding a new API route

1. Create `src/app/api/<resource>/route.ts`.
2. Call `getCurrentAppUser()` at the top — return `401` if null.
3. Check the user's role — return `403` if insufficient.
4. Add `.eq("org_id", appUser.org_id)` to every DB query and mutation.
5. Validate all incoming fields (type, length caps).
6. Return generic error messages to the client; log detailed errors server-side.
7. Run `npx tsc --noEmit` to confirm no type errors.
