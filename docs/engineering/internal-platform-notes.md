# Internal Platform Notes

This file consolidates engineering notes that were previously stored beside source files. It captures implementation guidance that is useful for maintainers but should live in the centralized documentation set.

## Admin Client Helpers

Work Hat uses Supabase clients with different trust boundaries:

| Client | Use |
|---|---|
| Server client | User-scoped reads/writes that should respect session and RLS |
| Browser client | Client-side session-aware UI reads/writes |
| Admin/service-role client | Trusted server-only operations that bypass RLS for system work |

The admin client must be used intentionally. Helper functions in `web/src/lib/supabase/admin-helpers.ts` reduce repeated fallback boilerplate:

| Helper | Use When |
|---|---|
| `getAdminClientOrThrow(label)` | The operation cannot proceed safely without service-role access |
| `getAdminClientOrLogError(label)` | The operation is important but can fail closed or return an error |
| `getAdminClientOrLogWarn(label)` | Graceful degradation is acceptable and expected |
| `getAdminClientOrHandle(label, handler)` | The caller needs custom handling by failure reason |
| `isAdminClientAvailable()` | Health checks or conditional behavior |

SOC 2 relevance:

- Service-role operations are privileged control points.
- Missing service-role configuration should be visible through logs.
- Audit, workflow, SLA refresh, prompt assignment, and trusted linking operations should use explicit admin paths when ordinary org members must not mutate records.

## Request-Scoped Caching

`web/src/lib/request-cache.ts` provides a small request-local cache abstraction:

```ts
interface RequestCache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttl?: number): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
  stats(): { size: number; keys: string[] };
}
```

Use it for expensive repeated lookups inside a single request, such as capability resolution. Do not use it as a cross-request cache. Cross-request authorization state can become stale and complicate evidence during access reviews.

Recommended key format:

```txt
domain:primary-id:scope:optional-detail
```

Examples:

- `cap:user-123:org-456`
- `role_caps:agent`
- `overrides:user-123:org-456`

Safeguards:

- Cache entries must be per request.
- TTLs are optional and should be short.
- Capability revocations should be respected on the next request.
- Never use request cache for secrets, tokens, or long-lived authorization decisions.

## Supabase Layout

`supabase/migrations/` is the authoritative schema history for the app.

Top-level SQL bootstrap files, if present, are convenience setup scripts for the Supabase SQL editor. They should mirror migration direction but never replace migrations. If schema changes, update migration files first.

SOC 2 relevance:

- Migration files are change-management evidence.
- RLS policy changes should be reviewed with security impact in mind.
- Schema changes involving audit logs, access control, prompt assignment, data retention, or org isolation should update the corresponding docs in the same PR.

