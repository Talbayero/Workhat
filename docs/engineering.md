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
