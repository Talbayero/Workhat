# Project Structure

This document defines the current Work Hat project structure, what belongs in each folder, and the guardrails for adding new code without turning the app into a route-by-route feature dump.

## Current Structure

```text
docs/
  architecture.md
  data-access-and-rls.md
  decisions.md
  engineering.md
  operations-runbook.md
  product.md
  project-structure.md
  security-compliance.md

supabase/
  migrations/
  001_schema.sql
  002_seed.sql
  production-*.sql
  setup.sql

web/
  src/
    ai/
    app/
    components/
    dictionaries/
    lib/
    __tests__/
```

## Main Folder Purposes

### `web/src/app`

Route entrypoints only.

What belongs here:
- App Router pages
- Route handlers
- Route-level loading and orchestration
- Error/loading boundaries

What should not grow here:
- Long prompt definitions
- Provider-specific integration code
- Reusable permission logic
- Shared analytics aggregation
- Shared mailbox or notification internals

Rule:
- A route may validate input, authorize the caller, call domain helpers, and shape the response.
- If logic is reused or longer than route orchestration, move it out.

### `web/src/components`

Reusable UI grouped by product area.

Current grouping:
- `components/dashboard`
- `components/inbox`
- `components/companies`
- `components/contacts`
- `components/context`
- `components/settings`
- `components/marketing`
- `components/layout`
- `components/ui`

Rules:
- Keep presentational and interaction logic here.
- Do not embed server secrets, prompt text, or raw provider clients.
- If a component becomes product-area-specific, place it in that area, not `ui/`.

### `web/src/lib`

Shared infrastructure and domain support code.

Current important areas:
- `lib/auth`
- `lib/supabase`
- `lib/security`
- `lib/sla`
- `lib/workflow-engine`
- `lib/email`
- `lib/context`
- `lib/data`
- `lib/analytics`

Rules:
- `lib/auth` is the source of truth for app-user resolution and capability checks.
- `lib/supabase` owns Supabase client creation and low-level DB infrastructure.
- `lib/data` is the stable entrypoint for product-domain data loaders used by pages/components.
- `lib/analytics` is the stable entrypoint for reporting and analytics helpers.
- `lib/email` owns mailbox integrations, Gmail OAuth helpers, token encryption, inbound processing, and outbound send logic.
- `lib/context` owns context object CRUD, versioning, selection, and validation rules.

### `web/src/ai`

AI runtime code only.

Current areas:
- `ai/providers`
- `ai/prompts`
- `ai/prompts/experiments`
- `ai/schemas`
- `ai/workflows`

Rules:
- Providers go in `providers/`.
- Prompt templates and prompt experiment logic go in `prompts/`.
- Output validation and JSON schema parsing go in `schemas/`.
- AI operations such as draft generation, intent classification, edit analysis, and knowledge generation go in `workflows/`.
- Do not place prompt strings directly inside routes or React components.

Planned but not created yet:
- `ai/evals`
- `ai/telemetry`

These should be added only when they contain real code.

### `supabase`

This is the current database source-of-truth folder and remains in place to preserve existing Supabase workflows.

Current areas:
- `supabase/migrations`
- schema bootstrap SQL
- seed SQL
- production repair/setup SQL

Why not `db/` yet:
- The repo already has an established Supabase layout.
- Renaming it now would add churn without improving behavior.
- If a future `db/` folder is introduced, it should be a deliberate migration, not a cosmetic alias.

### `docs`

Architecture notes, SOPs, product decisions, and operational guidance.

Rules:
- Architecture guidance goes in `docs/architecture.md`; decision records go in `docs/decisions.md`.
- Product and operational policies live here, not in route comments.

## Where New Files Should Go

### Routes

- New page: `web/src/app/<area>/page.tsx`
- New API route: `web/src/app/api/<domain>/<action>/route.ts`

Only keep route-local code in the route file if it is truly single-use and small.

Current context routes:
- `web/src/app/contexts`
- `web/src/app/api/context-objects`

### Components

- Shared primitive: `web/src/components/ui`
- Inbox UI: `web/src/components/inbox`
- Context UI: `web/src/components/context`
- Dashboard/reporting UI: `web/src/components/dashboard`
- Settings/team/admin UI: `web/src/components/settings`

### Auth, permissions, and RBAC

- App-user resolution: `web/src/lib/auth/app-user.ts`
- Capability checks: `web/src/lib/auth/capabilities.ts`
- Self-serve auth behavior: `web/src/lib/auth/self-serve.ts`

Rules:
- Do not duplicate auth checks inside many files.
- Do not create alternate permission maps in random routes.
- Keep Owner/admin, Support/agent, Reviewer/qa_reviewer, and manager capability rules centralized and auditable.

### Supabase

- Browser client: `web/src/lib/supabase/client.ts`
- Server client: `web/src/lib/supabase/server.ts`
- Admin/service-role client: `web/src/lib/supabase/admin.ts`

Rules:
- Do not create duplicate Supabase client factories elsewhere.
- Do not inline service-role initialization in route handlers.
- Keep service-role access server-only.

### Email and integrations

- Gmail OAuth and mailbox helpers: `web/src/lib/email`
- Provider adapters: `web/src/lib/email/adapters`
- Operational notification runtime: `web/src/lib/notifications`

Rules:
- Gmail OAuth remains the only MVP self-serve email connection path.
- Keep the callback route stable: `https://work-hat.com/api/oauth/google/callback`
- Do not expose Google or Supabase secrets to the client.
- Route handlers should call into `lib/email`, not implement provider flows inline.

### Notifications

Current notification runtime:

- Conversation assignment and QA follow-up emails: `web/src/lib/notifications/conversation-notifications.ts`
- Notification templates: `web/src/lib/notifications/email-templates.ts`

Rules:
- Reusable notification send/build logic belongs in `web/src/lib/notifications`.
- Do not duplicate conversation assignment or QA follow-up formatting across routes.
- Notifications in this repo must use Work Hat CRM language: conversations, inbox, QA follow-ups, companies, contacts.
- Links inside notification emails must be actual hyperlinks.
- Conversation links must be generated from server-side canonical app URL config, not hardcoded localhost or production strings inside templates.

### Analytics

- Reporting entrypoint: `web/src/lib/analytics`
- Product-domain reads for inbox, contacts, companies, and knowledge: `web/src/lib/data`

Rules:
- Dashboard aggregation belongs in analytics helpers, not inside page files.
- Domain data loaders belong in `lib/data`, not as ad hoc Supabase reads in many pages.

### Context Engine

Current context runtime:

- Context object services: `web/src/lib/context`
- Context data loaders: `web/src/lib/data/context.ts`
- Context pages: `web/src/app/contexts`
- Context-aware draft rendering: `web/src/ai`

Rules:
- Context objects are an operational guidance layer, not a second CRM model.
- Use one structured `context_definition_json` on versions; do not introduce a parallel rules engine in routes.
- Store exact context object and version provenance on `ai_drafts`.
- Keep `knowledge_entries` as the source of factual reusable content; contexts may reference them but should not duplicate them.
- Publish/archive flows must stay auditable through versioned records and audit logs.

### AI workflows, prompts, providers, telemetry, and evals

Rules:
- Providers must be wrapped behind `web/src/ai`.
- Prompt construction belongs in `ai/prompts`.
- Prompt rollout and assignment logic belongs in `ai/prompts/experiments`.
- Validation/parsing belongs in `ai/schemas`.
- Workflow logic belongs in `ai/workflows`.
- Future eval suites belong in `ai/evals`.
- Future token, cost, and user-feedback tracking belongs in `ai/telemetry`.

## What Not To Do

- Do not create giant catch-all utility files for unrelated business domains.
- Do not create another Supabase client helper outside `lib/supabase`.
- Do not duplicate auth resolution or capability checks in many routes.
- Do not place prompt strings inside routes, pages, or components.
- Do not expose OAuth credentials, service-role keys, refresh tokens, or encrypted secrets to the client.
- Do not move public routes just for aesthetics when they are part of an external integration contract.
- Do not add empty enterprise folders unless they immediately hold real code.
- Do not place context-definition JSON shaping or prompt strings inside route handlers or React components.

## Current Transitional Boundaries

These boundaries are intentional:

- `lib/supabase/queries.ts` still exists as a legacy aggregation file.
- New callers should prefer `lib/data` and `lib/analytics`.
- `supabase/` remains the DB root to avoid breaking existing workflows.
- `app/api/oauth/google/callback` remains unchanged because Google OAuth depends on it.

## Recommended Next Cleanup

- Split `lib/supabase/queries.ts` implementation into true domain files behind the current `lib/data` and `lib/analytics` entrypoints.
- Keep future notification types in `lib/notifications`; only introduce task-specific language if Work Hat adds a real first-class task module.
- Add `ai/telemetry` and `ai/evals` only when the corresponding runtime code is real.
