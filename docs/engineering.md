# Engineering

This document defines engineering conventions, testing expectations, and change-control practices for Work Hat.

## Principles

1. Keep route handlers thin. Domain logic belongs in `lib/`.
2. Keep org isolation explicit.
3. Require app-layer capabilities for authenticated writes.
4. Prefer deterministic logic for operations, workflow, SLA, and compliance-sensitive behavior.
5. Preserve human approval for customer replies.
6. Keep AI outputs traceable to prompts, knowledge, and source conversation context.
7. Update docs with material product, architecture, security, schema, or operational changes.

## File Organization

| Area | Convention |
|---|---|
| Routes | `web/src/app/**/route.ts` |
| UI components | `web/src/components/**` |
| Domain services | `web/src/lib/**` |
| Tests | `web/src/**/__tests__/**` or `web/src/__tests__/**` |
| Database | `supabase/migrations/*.sql` |
| Docs | `docs/*.md` |

Do not add new markdown files outside `docs/`.

## API Route Standard

Authenticated mutating routes should follow this shape:

1. Resolve the current app user.
2. Require the narrow capability for the action.
3. Validate the request body.
4. Resolve records with explicit `org_id`.
5. Mutate through the correct Supabase client.
6. Write audit/workflow/SLA evidence where applicable.
7. Return user-safe errors.

Do not expose raw database constraint names, stack traces, provider secrets, or environment variable names to normal users. Admin-only diagnostics may include exact missing configuration.

## Supabase Client Selection

| Client | Use |
|---|---|
| Server user client | User-scoped reads/writes that should respect session/RLS |
| Admin/service client | Trusted system writes, migrations, webhook processing, token persistence |
| Optional admin client | Diagnostics or fallback paths that can degrade gracefully |

Service-role use must be justified by route trust boundaries and must still preserve org scoping.

## Gmail MVP Standard

The self-serve MVP supports Gmail OAuth only.

Engineering requirements:

- Do not expose IMAP/SMTP, app password, mailbox password, or custom inbound as primary setup methods.
- Do not provide user interaction paths for IMAP/SMTP, app password, mailbox password, or custom inbound during the MVP.
- Do not count legacy forwarding addresses as readiness.
- Do not simulate customer reply sends.
- Do not allow generic outbound selection to use non-Gmail records during the MVP.
- Show admin setup health for missing platform-owned Google OAuth prerequisites.
- Keep redirect URI stable: `https://work-hat.com/api/oauth/google/callback`.
- Do not ask customers to configure Google Cloud, OAuth clients, redirect URIs, Vercel variables, or provider infrastructure.

## AI Engineering Standard

Draft generation must:

- Require `ai.generate`.
- Store prompt version.
- Preserve conversation and knowledge context.
- Avoid auto-send.
- Store AI draft output for later comparison.

Edit analysis must:

- Compare draft and final reply.
- Store deterministic metrics.
- Preserve categories and source examples where available.
- Remain org-scoped.

Prompt experimentation must:

- Assign deterministically.
- Persist assignment before use.
- Fall back safely when assignment persistence fails.
- Support rollback.
- Keep human approval in place.

## Context Engine V1 Standard

Context Engine V1 must stay lean:

- Context objects are org-scoped operational guidance records.
- Context versions are immutable snapshots used for AI traceability.
- Routes stay thin; context domain logic belongs in `web/src/lib/context`.
- Prompt rendering changes belong in `web/src/ai`.
- Context selection may influence draft generation, but it must never bypass human approval.
- `prompt_version` remains mandatory even when a context object is selected.
- `ai_drafts` must store the exact `context_object_id` and `context_object_version_id` used.
- `edit_analyses` should inherit context provenance from the source `ai_draft` when available.
- Context objects may reference `knowledge_entries`, but they must not duplicate the knowledge base into a parallel content system.

Required write capabilities:

- `context.read`
- `context.edit`
- `context.publish`

Publishing or archiving a context object requires a narrower permission than general editing.

## Workflow Standard

Workflow rules are deterministic and auditable.

Allowed:

- Fixed event types.
- JSON condition comparisons.
- Fixed TypeScript action allowlist.
- Execution records.
- Disabled/enabled rules.

Not allowed in the current phase:

- Arbitrary scripting.
- User-supplied SQL.
- Open-ended webhooks.
- Recursive automation loops.
- AI-driven rule execution without deterministic guardrails.

## SLA Standard

SLA computation must be explainable from stored data:

- Org-level policy.
- Message timestamps.
- Conversation status.
- Last inbound/outbound message state.
- Computed due time.
- At-risk or breached status.

Queue views should filter by SLA, risk, assignee, status, channel, and intent.

## Inbox UI Standard

Inbox and thread workspace changes must preserve the Gmail-only MVP path and make the operator state explicit:

- The latest inbound customer message should be visible directly under the conversation header, not duplicated above the composer.
- Customer messages, outbound replies, internal notes, and system/activity events should not share the same visual treatment.
- Buttons must be either wired, hidden when not applicable, or disabled with visible user-facing reason text.
- Send remains human-approved and must not trigger when the reply is empty, the conversation is closed, or no inbound customer message exists.
- AI Draft should be disabled with a reason when no latest inbound customer message exists.
- Collapsible navigation or queue state may use browser-local persistence only; do not persist layout preference to tenant data unless there is a product requirement.
- The primary app sidebar should fully hide behind a small keyboard-accessible edge handle.
- Queue width controls should use a clear draggable resize handle with keyboard support, min/max bounds, and no raw pixel display.
- Theme switching should be discoverable from both Settings -> Appearance and the app sidebar footer; the sidebar control should stay compact.
- Inbox and thread layouts should avoid horizontal overflow at common browser zoom levels and collapse secondary panels before crushing the composer.

## Theme Standard

The app supports `light`, `dark`, and `system` theme preferences through CSS variables and browser-local preference storage.

- Theme values live in `web/src/app/globals.css`.
- Theme preference logic lives in `web/src/lib/theme`.
- Focus states must remain visible in both themes.
- New components should use Work Hat tokens such as `--background`, `--foreground`, `--panel`, `--panel-strong`, `--line`, `--muted`, `--moss`, `--amber`, `--success`, `--warning`, and `--danger` instead of hard-coded one-off colors.

## Testing

Required commands before merging material changes:

```text
npm test -- --runInBand
npm run type-check
npm run lint
npm run build
```

For schema changes:

- Add append-only migrations.
- Make migrations idempotent where practical.
- Backfill before applying stricter constraints.
- Verify production-like existing values before adding checks.
- Ensure every new org-owned table includes `org_id`, authenticated grants, and RLS policies before relying on it in production.

For security or compliance-sensitive changes:

- Test success and failure paths.
- Test missing capability.
- Test cross-org isolation where practical.
- Test malformed input.
- Test audit/logging behavior where practical.

## Change Management

Every material change should leave evidence:

- Git commit.
- Test/build output.
- Migration file for schema changes.
- ADR for material architecture/control decisions.
- Documentation update for affected behavior.

SOC 2 Type 2 readiness requires evidence that this process operates consistently over time.

## Pull Request / Review Checklist

- Scope is clear.
- No unrelated refactors.
- Capabilities are enforced on authenticated writes.
- Org scoping is explicit.
- User-facing errors are safe.
- Secrets are not logged.
- Tests cover meaningful behavior.
- Docs are updated.
- Migration order is safe for populated databases.

Last updated: April 2026
