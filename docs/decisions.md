# Architecture Decision Records

This file is the log of significant platform decisions — what we chose, why, and what we explicitly ruled out. Entries are append-only. If a decision is reversed, add a new entry that supersedes the old one and links back to it.

---

## Format

Each record follows this structure:

```
## ADR-NNN — Title
**Date:** YYYY-MM
**Status:** Accepted | Superseded by ADR-NNN

### Decision
One sentence: what we decided.

### Context
What problem we were solving and what options we considered.

### Rationale
Why this option was chosen over the others.

### Consequences
What this decision makes easier, harder, or constrains going forward.
```

---

## ADR-001 — docs/ as the Source of Truth for Platform Documentation

**Date:** 2026-04
**Status:** Accepted

### Decision

All platform documentation lives in the `docs/` folder. No exceptions for new documentation.

### Context

The repo accumulated planning documents at the root (`prd.md`, `technical-build-spec.md`, `supabase-schema-migration-plan.md`) that described the system as intended, not as built. As the codebase grew, these documents became increasingly inaccurate and there was no clear authority for where to look for true architectural guidance.

### Rationale

A single, explicit docs home eliminates ambiguity about where to write and where to look. Root-level planning docs are preserved as historical artifacts but are explicitly marked as non-authoritative. New documentation must go in `docs/` or it will not be found.

### Consequences

- Contributors have one place to check and one place to update.
- The root-level planning docs will gradually diverge from reality and should eventually be archived or removed.
- Every meaningful code change should include a `docs/` update in the same PR.

---

## ADR-002 — Next.js App Router (not Pages Router)

**Date:** 2026-01
**Status:** Accepted

### Decision

The application uses Next.js App Router exclusively. No Pages Router files exist or should be added.

### Context

Next.js supports two routing paradigms: the legacy Pages Router (`pages/`) and the modern App Router (`app/`). The App Router is the direction Next.js is investing in — it enables React Server Components, nested layouts, streaming, and colocated route handlers.

### Rationale

Server components dramatically simplify data fetching patterns: fetch data in the component, no API round-trip required, no client-side loading states for initial render. The App Router's `route.ts` convention for API handlers is cleaner than `pages/api/`. Nested layouts (`layout.tsx`) allow the app shell (sidebar + topbar) to wrap all authenticated routes without prop drilling.

### Consequences

- All routes are in `app/`. Server components are the default — `"use client"` is opt-in.
- Cannot use Pages Router conventions (e.g., `getServerSideProps`, `getStaticProps`). Data fetching is done directly in async server components or in `route.ts` handlers.
- Middleware runs at the edge and doesn't have access to Node.js APIs.

---

## ADR-003 — Supabase for Auth, Database, and Storage

**Date:** 2026-01
**Status:** Accepted

### Decision

Supabase is the unified backend: PostgreSQL database, authentication, row-level security, and file storage.

### Context

Options considered: PlanetScale (MySQL, no RLS), Neon (Postgres, no auth), Firebase (NoSQL, poor relational modeling), or a separate auth provider (Auth0, Clerk) paired with an external database.

### Rationale

Work Hat's data model is relational and multi-tenant. Row-level security at the database layer is a natural fit for tenant isolation. Supabase bundles Postgres + Auth + RLS + Storage under a single API surface, which eliminates the integration overhead of combining separate services. The `@supabase/ssr` package handles Next.js App Router cookie management cleanly.

### Consequences

- All schema changes go through Supabase migrations (`supabase/migrations/`).
- Auth tokens are Supabase JWTs. Gmail OAuth tokens are separate and stored encrypted in the database (not in Supabase Auth).
- Running locally requires `supabase start` (Docker). There is no option to run the DB without Supabase tooling.
- Supabase's free tier limits (project pause, row limits) are a factor in production planning.

---

## ADR-004 — Service Role Client for System-Level Writes

**Date:** 2026-01
**Status:** Accepted

### Decision

A Supabase admin client (using `SUPABASE_SERVICE_ROLE_KEY`) is used for system-level database operations that must bypass RLS: onboarding bootstrap, webhook processing, and cron jobs.

### Context

RLS is the right default for user-initiated actions, but certain system operations (e.g., creating the first user row during org creation, processing an inbound Gmail Pub/Sub message before a user session exists, running data retention jobs) cannot be scoped to a user session.

### Rationale

The admin client is the correct Supabase primitive for trusted server contexts. The alternative — granting broad RLS permissions to the anon role or inserting before RLS is established — would weaken the security model more severely.

The service role key is validated at startup in `lib/supabase/admin.ts`: it checks for the new `sb_secret_...` format (and accepts legacy JWTs with a warning). This prevents accidental use of a public anon key in the admin client.

### Consequences

- The admin client must never be used in browser-accessible code paths or in components. It is imported only in `lib/` modules called from API routes and cron handlers.
- Any new use of the admin client requires deliberate review — it is not the default.
- The service role key must be kept out of the client bundle. It is a server-only environment variable (`SUPABASE_SERVICE_ROLE_KEY`, no `NEXT_PUBLIC_` prefix).

---

## ADR-005 — Middleware-Based Auth with Supabase SSR

**Date:** 2026-01
**Status:** Accepted

### Decision

Authentication enforcement runs in `middleware.ts` using Supabase's `@supabase/ssr` package to refresh session cookies and `supabase.auth.getUser()` to validate sessions server-side on every request.

### Context

Options considered: (1) verify auth only in individual route handlers, (2) verify auth only in server component layouts, (3) verify auth in middleware centrally. Options 1 and 2 risk missing a route and leaving it unprotected. Option 3 is centralized and auditable.

### Rationale

A single middleware file is the only place where auth enforcement can be guaranteed across all routes. It also handles the cookie refresh needed to prevent sessions from expiring mid-use. `getUser()` validates the JWT against the Supabase server (not just locally), which prevents use of tampered or expired tokens.

The middleware classifies routes as public or protected. Public routes (webhooks, demo, marketing, OAuth callbacks) pass through without session checks. All others require a valid session.

### Consequences

- Adding a new route that should be public requires updating the public route list in `middleware.ts`. This is intentional — the default is protected.
- The middleware runs on the edge runtime, which has limitations (no Node.js built-ins). Business logic must remain in Node.js API routes.
- Webhook routes must be explicitly listed as public — they must still perform their own caller-identity verification (signature, shared secret).

---

## ADR-006 — Three Supabase Client Scopes (Server, Browser, Admin)

**Date:** 2026-01
**Status:** Accepted

### Decision

Three distinct Supabase client factories are maintained for three contexts: server-side (SSR, session-scoped), browser-side (persistent session), and admin (service role, RLS bypass).

### Context

Using the wrong client in the wrong context causes two classes of bugs: (1) using a session-scoped client in a context without a session (returns null, causes errors), or (2) using the admin client in a user-facing context (bypasses security controls). A clear three-way split makes the right choice obvious.

### Rationale

Each factory has one job and one set of valid callers. `server.ts` is for server components and API routes doing normal user-scoped work. `client.ts` is for browser components. `admin.ts` is for trusted system contexts. Having three separate files makes incorrect imports visible in code review.

### Consequences

- Importing `admin.ts` in a component or a browser-accessible code path is always wrong — reviewers should flag it.
- The server client requires a request context (to read cookies). It cannot be used in a singleton or global scope.
- The browser client is a singleton per page load. It should not be recreated on every render.

---

## ADR-007 — Gmail API (not Postmark/Resend) as the Email Integration

**Date:** 2026-02
**Status:** Accepted

### Decision

Gmail API via OAuth 2.0 is the primary email integration for inbound and outbound messages. Postmark and Resend are not used in V1.

### Context

The original PRD and technical spec listed Postmark for transactional email and considered Postmark for inbound email webhooks. During Phase 2 implementation, the target customer profile (small support teams using Gmail-based support inboxes) made a native Gmail integration more compelling than a third-party relay.

### Rationale

A direct Gmail OAuth integration lets customers connect their existing support inbox without redirecting mail flow through a third-party service. Customers don't have to change their MX records or set up forwarding rules. Gmail Pub/Sub push provides near-real-time inbound message delivery. The Gmail API also gives access to the full thread model, making conversation threading more reliable.

### Consequences

- Each connected Gmail account requires an OAuth 2.0 grant with `gmail.readonly` and `gmail.send` scopes. This requires a Google Cloud project and OAuth app approval for production.
- Gmail push watches expire every 7 days. A cron job at `/api/email/gmail/renew-watches` must run to renew them.
- Gmail API rate limits apply. High-volume orgs may hit limits — this will require quota increases from Google.
- Postmark and Resend env vars remain in the codebase but are inactive. They should be removed in a future cleanup.
- Non-Gmail inbound email (the `/api/inbound/email` route) is scaffolded but not fully implemented for V1.

---

## ADR-008 — No AI Draft Sent Without Human Approval

**Date:** 2026-01
**Status:** Accepted

### Decision

No AI-generated draft can be sent to a customer without an agent explicitly confirming the send. This is a non-negotiable product rule enforced at the API layer.

### Context

Work Hat's core value proposition is AI assistance, not AI automation. The target customers (SMB support teams) are trust-sensitive — they need confidence that every customer message was reviewed by a human. Removing the human approval gate would change the product's risk profile entirely.

### Rationale

The Edit Analyzer (Work Hat's differentiating feature) only works if agents are reviewing and editing drafts. If drafts could auto-send, there would be no edits to analyze and the improvement loop would break. Human approval is not just a safety measure — it is what makes the product work.

### Consequences

- The `/api/conversations/[conversationId]/reply` route requires explicit agent action to send. It does not auto-send the most recent draft.
- The `sent_replies` table always records the actual sent text (after any edits), not the draft text.
- Any feature that would allow auto-send or scheduled send must be reviewed against this decision before implementation.

---

## ADR-009 — Deterministic Diff Before LLM Classification in Edit Analysis

**Date:** 2026-02
**Status:** Accepted

### Decision

Edit analysis always runs a deterministic diff first (`lib/edit-analysis.ts`). LLM-based classification is only invoked when the diff indicates a meaningful edit has occurred.

### Context

Running LLM inference on every sent reply — including replies where the agent sent the draft unchanged — would waste tokens and add latency for no benefit. The diff result also provides ground-truth metrics (edit distance, change percentage) that are more reliable than LLM estimates.

### Rationale

The deterministic diff is cheap, fast, and produces numeric metrics that can be queried and aggregated without LLM involvement. Using it as a gate means LLM costs scale with actual edit volume, not with reply volume. The diff output is also stored in `edit_analyses` as factual data, separate from the LLM's interpretive classification.

### Consequences

- Small formatting or whitespace changes that register above the diff threshold will still trigger LLM classification. The threshold may need tuning over time.
- The LLM classification categories (tone, policy, missing_context, factual, structure, full_rewrite) are interpretive and may evolve. The deterministic metrics (edit_distance_score, change_percent) are stable.

---

## ADR-010 — Google Drive Integration: Not in V1

**Date:** 2026-02
**Status:** Accepted

### Decision

Google Drive integration is explicitly out of scope for V1. Knowledge base content is managed directly within Work Hat.

### Context

An early feature idea proposed letting orgs connect a Google Drive folder as a knowledge source — documents would be synced, chunked, and used in draft generation. This would reduce onboarding friction for teams that already have SOPs in Drive.

### Rationale

The knowledge base editor within Work Hat provides tight control over content quality, chunking, and embedding. Drive sync would introduce a complex two-way sync problem, version conflicts, and dependency on a Google Drive OAuth scope that adds to the approval surface. The V1 target is to prove the core loop (inbox → draft → edit → improve), not to solve knowledge ingestion.

### Consequences

- Knowledge must be entered or pasted into Work Hat directly in V1.
- A Drive import/sync feature would be a natural V2 addition, using the existing knowledge entry and chunking infrastructure.

---

## ADR-011 — Transactional Email (Notifications): Not in V1

**Date:** 2026-02
**Status:** Accepted

### Decision

Work Hat does not send transactional notification emails to its own users in V1 (e.g., "you've been assigned a conversation", "a new reply came in"). The focus is on the support workflow, not on notification infrastructure.

### Context

Postmark and Resend are both in the original env var list. Neither is actively used. The product currently relies on in-app visibility (inbox unread counts, conversation status) rather than push notifications to users.

### Rationale

Building a reliable notification system (preferences, unsubscribe, bounce handling) is significant scope. For V1 SMB teams (5–20 agents), in-app visibility is sufficient — teams are typically in the app during their shift. Notification emails can be added in V2 when customer demand is established.

### Consequences

- Team members must be in the app to see new conversations. There are no email alerts.
- The `POSTMARK_SERVER_TOKEN` and `RESEND_API_KEY` env vars can be removed in a cleanup pass.

---

## ADR-012 — Time Tracking: Not in V1

**Date:** 2026-02
**Status:** Accepted

### Decision

Agent time tracking (time-on-conversation, handle time metrics) is out of scope for V1.

### Context

Time tracking is a common CRM feature and relevant to BPO billing. It was considered for the manager dashboard.

### Rationale

The Edit Analyzer and AI improvement metrics are the primary V1 dashboard story. Time tracking adds schema complexity (session events, pause/resume state) that would delay the core product. The `usage_events` table can accommodate time-based events in V2 without schema changes.

### Consequences

- The manager dashboard in V1 focuses on AI quality metrics (confidence trends, edit categories, draft acceptance rate), not agent efficiency metrics.
- Time tracking can be added as metered usage events in V2.

---

## ADR-013 — Snowflake / Data Warehouse: Not in V1

**Date:** 2026-02
**Status:** Accepted

### Decision

There is no Snowflake or external data warehouse integration in V1. All analytics queries run against the Supabase PostgreSQL database directly.

### Context

Enterprise CRMs often export to a data warehouse for BI. At V1 scale (SMB, 5–20 agents), Postgres can handle all analytics queries needed for the dashboard.

### Rationale

Introducing a data pipeline to Snowflake adds significant operational complexity (ETL jobs, schema sync, credential management, latency). At V1 customer scale, the operational overhead is not justified. Postgres with appropriate indexes handles the aggregations needed for dashboard metrics without a separate warehouse.

### Consequences

- Dashboard queries run against the live Postgres instance. Heavy analytical queries should be written with `created_at` range filters and use existing indexes to avoid table scans.
- If customer scale grows to the point where analytical queries impact transactional performance, read replicas or a warehouse can be added without major application changes.

---

## ADR-014 — PWA and Browser Push Notifications: Not in V1

**Date:** 2026-03
**Status:** Accepted

### Decision

Work Hat is not a Progressive Web App in V1. There is no `manifest.json`, no service worker, and no browser push notification support.

### Context

PWA features (installability, offline support, push notifications) were considered as a way to improve the mobile and cross-platform experience for agents.

### Rationale

Real-time inbox updates are handled server-side via Gmail Pub/Sub → `/api/email/gmail/push` → database write → client polling or future WebSocket. Browser push requires a service worker, a push subscription backend, and notification permission prompts — significant scope that doesn't address the core product problems in V1.

The app has standard favicon and apple-icon assets for bookmarking, which is sufficient for V1 agent workflows that are primarily desktop-browser-based.

### Consequences

- Agents must keep the browser tab open to see new conversation counts (no OS-level push notifications).
- Adding PWA support later is straightforward: add a `manifest.json`, register a service worker, and wire up the Web Push API. The existing Pub/Sub infrastructure is already in place for the notification trigger.

---

## ADR-015 — Capability Authorization Behind Role Presets

**Date:** 2026-04
**Status:** Accepted

### Decision

Work Hat keeps the existing user-facing roles (`admin`, `manager`, `agent`, `qa_reviewer`) but maps them internally to capabilities. API routes should authorize with capability helpers from `lib/auth/capabilities.ts`.

### Context

The platform is multi-tenant and app-layer authorization is primary. Hardcoded role arrays were spreading across API routes, which made future exceptions and customer-specific access changes risky.

### Rationale

Capabilities let the product evolve without exposing complex permission management in the UI. Roles remain stable presets, while optional org-scoped user overrides can grant or revoke individual capabilities when needed.

### Consequences

- Existing role behavior is preserved through seeded `role_capabilities`.
- A new `user_capability_overrides` table supports per-user grants/revokes.
- Routes can migrate gradually from role arrays to capability helpers.
- The helper falls back to built-in presets if the migration is not deployed yet, making deploy order safe.

---

## ADR-016 — Upstash Redis for API Rate Limiting

**Date:** 2026-04
**Status:** Accepted

### Decision

Work Hat uses Upstash Redis for API gateway rate-limit counters and dynamic blacklist entries. In-memory counters are not acceptable for production request protection.

### Context

The app runs on Vercel serverless/edge infrastructure. Process memory can reset on cold starts and does not coordinate across concurrent regions or instances, so a `Map`-based limiter could undercount abusive traffic and over-rely on a single warm process.

### Rationale

Upstash Redis is serverless-friendly, available through the Vercel Marketplace, and cost-effective for small counter workloads. It preserves the existing route-group policy model while making the store durable enough for AI endpoints, public forms, auth-sensitive APIs, and webhooks.

### Consequences

- Production deployments require `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- Local development fails open by default so developers are not blocked by missing Redis.
- Trusted system webhooks are rate limited but excluded from dynamic blacklisting to avoid blocking provider retry storms.
- Per-policy thresholds remain configurable through environment variables.

---

## ADR-017 — Lean Event Rules Instead of a BPM Workflow Builder

**Date:** 2026-04
**Status:** Accepted

### Decision

Work Hat V2 uses a lightweight database-backed event and rules engine for operational automation, not a full visual workflow or BPM engine.

### Context

Work Hat is evolving from CRM into an operations OS. The platform needs to react to events like new conversations, high-risk messages, draft generation, replies, and SLA breaches. Options considered were: database triggers, a visual workflow builder, a durable external workflow service, or a small application-layer rules engine.

### Rationale

A small application-layer rules engine gives the product useful automation while keeping the codebase understandable. Rules are ordinary org-scoped database rows; conditions are deterministic JSON comparisons; actions are a fixed TypeScript allowlist. This avoids the complexity of arbitrary workflow graphs, user-authored scripts, recursive trigger chains, and AI-based decisioning in core execution.

### Consequences

- There is no visual workflow builder in this phase.
- Rule actions do not recursively emit workflow events in V2, which prevents runaway loops by design.
- Execution is auditable through workflow execution tables, separate from compliance `audit_logs`.
- Adding new actions requires code review and a migration/doc update.
- Chained workflows, external webhooks, delays, approvals, and long-running orchestration remain future features.

---

## ADR-018 — SLA Snapshots for Queue Health

**Date:** 2026-04
**Status:** Accepted

### Decision

Work Hat stores SLA configuration per org and stores the current SLA state as a snapshot on each conversation. Queue health views read these snapshots instead of recomputing deadlines from message history on every page load.

### Context

The product needs first-response and next-response SLA awareness, overdue detection, and manager-facing queue health without becoming a full workforce management system. The queue must be filterable by SLA state, risk, assignee, status, channel, and intent.

### Rationale

Conversation snapshots make SLA state fast, explainable, and auditable. The deterministic evaluator in `lib/sla/` can run after message writes and from an hourly cron to catch time-based breaches. This avoids database triggers, vague AI decisioning, and expensive message-history scans in operational views.

### Consequences

- SLA computation is deterministic TypeScript with a small org policy table.
- V2 uses calendar minutes; business-hours policy JSON is reserved for a later evaluator.
- Queue health can load quickly from indexed conversation fields.
- `sla.breached` is emitted only on breach transitions and can feed the workflow engine.
- If refresh jobs fail, message-write refresh still updates active threads, and the next cron run repairs overdue state.

---

## ADR-019 — Deterministic AI Improvement Engine V1

**Date:** 2026-04
**Status:** Accepted

### Decision

Work Hat V1 computes AI improvement insights from existing `ai_drafts`, `edit_analyses`, `conversations`, and `knowledge_entries` records using deterministic application code. It does not introduce a black-box recommendation model or automatically edit prompts and knowledge.

### Context

The product goal is continuous operational improvement, not only AI reply drafting. Existing draft and edit-analysis records already capture prompt version, diff metrics, edit categories, and likely correction reasons. Operators need these signals converted into prompt, knowledge, and performance recommendations.

### Rationale

Deterministic aggregation keeps recommendations explainable. Prompt-version metrics are direct rollups. Repeated edit patterns are grouped by category and normalized reason tokens. Knowledge recommendations use token overlap against active knowledge entries and include edit-analysis evidence IDs. This gives managers useful insight without requiring a new ML pipeline.

### Consequences

- Insights are org-scoped and computed at dashboard read time for V1.
- Recommendations are review prompts, not automatic changes.
- Every cluster and recommendation includes traceable edit-analysis evidence.
- If tenant scale grows, the same output shape can be persisted as periodic insight snapshots.

---

## ADR-020 — Controlled Prompt Experiments

**Date:** 2026-04
**Status:** Accepted

### Decision

Work Hat supports prompt experiments through deterministic, org-scoped traffic assignment. Prompt variants are weighted database rows, assignments are sticky per conversation, and generated drafts continue to store the selected `prompt_version`.

### Context

The platform needs to learn which prompt strategies improve operational outcomes without introducing random per-request behavior or removing human approval. Existing outcome analytics already compare drafts by `prompt_version`.

### Rationale

A small assignment layer before draft generation fits the current provider abstraction. Hash buckets give controlled allocation without ML infrastructure. Persisted assignments make the system auditable and let operators explain why a conversation used a version. Rollback is a status change to `rolled_back`, which immediately routes new drafts to the rollback version.

### Consequences

- Human approval remains required before sending every draft.
- Experiments can compare multiple active prompt versions with controlled allocation.
- Assignment and rollback are deterministic and traceable.
- V1 does not include bandits, automatic winner promotion, or automatic prompt rewrites.
- Prompt-version performance is analyzed through the AI Improvement Engine and `ai_drafts.prompt_version`.

*Last updated: April 2026*
