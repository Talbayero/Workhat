# Code Quality Standards

This file centralizes code quality standards for Work Hat CRM. The standards support reliable releases and SOC 2 change-management evidence.

## Required Checks

Run these before merging security, schema, AI, workflow, or operational changes:

```bash
cd web
npm test -- --runInBand
npm run type-check
npm run lint
npm run build
```

## TypeScript

- Keep `strict` TypeScript enabled.
- Prefer explicit domain types for API payloads, database result shapes, and shared lib functions.
- Avoid `any` in production code.
- Test mocks may use looser typing where necessary, but should not hide product behavior.
- Use `unknown` and type guards for untrusted request bodies.
- Keep generated or placeholder Supabase database types clearly labeled.

## Validation

- Validate request body shape before side effects.
- Use shared Zod schemas where the same payload shape appears in multiple routes.
- Cap string lengths and list sizes at the API boundary.
- Reject non-object JSON payloads for object endpoints.
- Treat validation failure as `400` or `422`, not `500`.

## Authorization

- Every authenticated route starts with `getCurrentAppUser()`.
- Sensitive routes must call `requireCapability()` or `requireAnyCapability()` before side effects.
- Keep authorization in route handlers or server components, not client components.
- Keep org filters explicit in application queries even when RLS also applies.

## Testing

Default tests:

```bash
npm test -- --runInBand
```

Integration and e2e tests are explicit:

```bash
npm run test:integration
npm run test:e2e
```

Do not run live integration tests against production Supabase data.

## Lint Warnings

Warnings should be triaged. Some current warnings are known in test mocks and legacy image usage. New product code should avoid adding warnings unless there is a clear reason.

## Change Management Evidence

For SOC 2 readiness, meaningful changes should leave:

- Git commit history.
- Passing build/test/type-check logs.
- Migration files for schema changes.
- ADR updates for major decisions.
- Documentation updates for security, AI, workflow, SLA, or compliance behavior.

