# Conventions

These are the rules that keep the codebase consistent. When in doubt, match the existing pattern before introducing a new one.

---

## Documentation

- All platform documentation lives in `docs/`. See `docs/README.md` for the rules.
- Historical planning docs live in `docs/archive/planning/`. Don't edit them as active guidance — update the relevant active `docs/` file instead.
- Decision records go in `docs/decisions.md`. Every significant architectural or integration choice gets an entry.
- Update the relevant `docs/` file in the same PR as the code change. Stale documentation is treated as a bug.

---

## File Organization

```
web/src/
├── app/            # Next.js App Router — pages and API routes only
│   ├── api/        # Route handlers (one route.ts per endpoint)
│   ├── [route]/    # Page files (page.tsx, layout.tsx, error.tsx)
│   └── demo/       # Auth-free demo mirrors of all main routes
├── components/     # React components, organized by domain
│   ├── [domain]/   # e.g. inbox/, contacts/, dashboard/
│   ├── layout/     # App shell, sidebar, topbar
│   ├── marketing/  # Landing page components
│   └── ui/         # Generic UI primitives (error boundaries, etc.)
├── lib/            # Server-side business logic and utilities
│   ├── ai/         # AI orchestration (provider, prompts, schemas)
│   ├── auth/       # getCurrentAppUser() and auth helpers
│   ├── email-connector/  # Provider-neutral inbound email, Gmail adapter/sender, encryption
│   ├── security/   # Rate limiting, circuit breaker
│   └── supabase/   # Client variants (server, client, admin, queries)
└── proxy.ts        # Edge proxy — runs before every request
```

**Rule:** Business logic belongs in `lib/`. Route handlers call into `lib/` — they don't contain logic themselves beyond request parsing, auth checks, and response shaping. Components receive data as props; they don't call `lib/` directly.

---

## Next.js Conventions

### Server vs. Client Components

Default to **server components**. Add `"use client"` only when the component needs browser APIs, React state, or event handlers.

```tsx
// Server component (default) — no directive needed
export default async function InboxPage() {
  const supabase = await createServerClient()
  const conversations = await getConversations(supabase)
  return <InboxWorkspace conversations={conversations} />
}

// Client component — explicit directive required
"use client"
export function ReplyComposer({ draft }: { draft: AIDraft }) { ... }
```

### Pages vs. Shells

Pages (`page.tsx`) handle data fetching and auth verification at the route level. They pass data down to a `*-shell.tsx` component that owns the layout and UI state. Pages should be thin.

Operational pages such as `/audit` must keep query logic in `lib/` helpers. The page resolves the user, checks the relevant capability, parses search params, and passes the helper result into the shell component.

### Error Boundaries

Every route segment that can fail independently gets an `error.tsx` file. This is already in place for all main app sections.

### API Routes

One `route.ts` file per endpoint directory. The file exports HTTP verb functions (`GET`, `POST`, `PATCH`, `DELETE`) as named exports.

```typescript
// app/api/conversations/route.ts
export async function GET(request: Request) { ... }
export async function POST(request: Request) { ... }
```

No catch-all route handlers. If a resource has different semantics at the collection vs. item level, use separate directories: `conversations/route.ts` and `conversations/[conversationId]/route.ts`.

### Proxy

`proxy.ts` is the only place for cross-cutting request concerns. The order is: API gateway preflight -> session refresh -> API gateway identity limits -> auth routing. Do not add route-specific business logic here.

The `matcher` config must explicitly list patterns. Public routes are defined in `proxy.ts`; if you add a new public route (webhook, demo page, marketing page), add it there too.

API rate limits belong in `lib/security/api-gateway.ts`, not individual route handlers. Preserve the route-group policy model unless a route has materially different risk or cost characteristics. Policy keys should be stable, lowercase, and hyphenated because environment overrides are derived from them.

Rate limit identity rules:
- Public forms and unauthenticated webhooks use IP.
- Authenticated application routes use user identity when available and fall back to IP.
- High-cost tenant-scoped routes may use org identity when the caller can provide `orgId`; otherwise user/IP fallback is acceptable.
- Trusted system webhooks may be rate limited, but must not trigger dynamic blacklist entries.
- Authenticated onboarding bootstrap may fail open when the Redis rate-limit store is unavailable, because `/api/org/create` still requires a valid Supabase session and must not block first-run setup during a transient protection-store outage.

Use Upstash Redis for counters and dynamic blacklist entries. Do not reintroduce in-memory `Map` counters for production request protection; they reset on serverless cold starts and do not coordinate across Vercel instances.

---

## Data Access

### Client Selection

Use the right Supabase client for the context. Using the wrong one is a security issue:

| Context | Client | File |
|---|---|---|
| Server component | `createServerClient()` | `lib/supabase/server.ts` |
| API route (normal) | `createServerClient()` | `lib/supabase/server.ts` |
| API route (system/admin) | `createAdminClient()` | `lib/supabase/admin.ts` |
| Browser component | `createBrowserClient()` | `lib/supabase/client.ts` |

Never import the admin client in a browser component or a code path that can be reached from the browser.

### Query Patterns

Always scope queries with `org_id`. Even when RLS would enforce this, the app layer must be explicit:

```typescript
const { data } = await supabase
  .from('conversations')
  .select('*')
  .eq('org_id', user.org_id)   // always explicit
  .eq('status', 'open')
  .order('updated_at', { ascending: false })
```

Common queries (conversations list, contact lookup, knowledge retrieval) are extracted into `lib/supabase/queries.ts` to avoid duplication.

### getCurrentAppUser()

Every authenticated API route and server component starts with:

```typescript
const user = await getCurrentAppUser()
if (!user) return new Response('Unauthorized', { status: 401 })
```

`getCurrentAppUser()` in `lib/auth/app-user.ts` resolves the Supabase auth session to the `users` table row (including `org_id` and `role`). It falls back to the admin client when the session-scoped client can't read the users table (e.g., during onboarding before RLS grants are in place).

---

## Permissions

Authorization happens in API route handlers, after `getCurrentAppUser()` and before any sensitive DB query or side effect.

```typescript
const denied = await requireCapability(user, 'integrations.manage', 'gmail/connect')
if (denied) return denied
```

Roles still exist (`admin`, `manager`, `agent`, `qa_reviewer`) but should be treated as compatibility presets. New code should check capabilities from `lib/auth/capabilities.ts`, not hardcoded role arrays.

Use:

- `hasCapability()` when the route needs custom redirect/error behavior.
- `requireCapability()` when a standard JSON `403` is correct.
- `hasAnyCapability()` or `requireAnyCapability()` only when a route intentionally accepts more than one capability.

Do not put fine-grained authorization logic in `proxy.ts` (it doesn't have the app user) or in components (clients can't be trusted). Capability checks live in API routes and server components only.

Per-user capability overrides are optional and org-scoped. They should be used sparingly for exceptions, not as a replacement for clean role presets.

The four roles and their intended scopes are documented in `architecture.md`. When adding new routes, decide at design time which roles can access them.

---

## API Routes

### Structure

```typescript
export async function POST(request: Request) {
  // 1. Auth
  const user = await getCurrentAppUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // 2. Capability check (if route is restricted)
  const denied = await requireCapability(user, 'settings.manage', 'settings/org')
  if (denied) return denied

  // 3. Parse & validate request body
  const body = await request.json()
  if (!body.required_field) {
    return Response.json({ error: 'required_field is required' }, { status: 400 })
  }

  // 4. Business logic (call into lib/)
  const result = await doTheThing(user, body)

  // 5. Return
  return Response.json(result, { status: 201 })
}
```

### Error Responses

Return JSON for all error responses on API routes. Clients parse JSON.

```typescript
return Response.json({ error: 'Conversation not found' }, { status: 404 })
```

Use standard HTTP status codes: 400 (bad request), 401 (unauthenticated), 403 (forbidden), 404 (not found), 409 (conflict), 422 (validation), 500 (server error).

### Webhooks

Webhook routes are public (no session required) but must verify the caller's identity via a secret or signature:
- Stripe: HMAC-SHA256 signature verification in `lib/stripe.ts`
- Gmail Pub/Sub: `GMAIL_PUSH_TOKEN` header check
- Custom inbound email: per-channel shared token accepted as `Authorization: Bearer`, `X-WorkHat-Inbound-Token`, or `X-Inbound-Token`
- Cron jobs: `CRON_SECRET` Authorization header check

Webhook route handlers stay thin. They parse the request, verify the caller, and call a `lib/` processor. Domain behavior such as contact creation, conversation threading, SLA refresh, and workflow event emission belongs in `lib/`, not inside public webhook route files.

---

## Migrations

Migrations live in `supabase/migrations/` and are named `NNNN_<description>.sql` (zero-padded 4-digit counter, lowercase underscore description).

Rules:
- Migrations are **append-only**. Never edit an existing migration file after it has been applied to any environment.
- Every migration must be idempotent where possible (use `if not exists`, `create or replace`, etc.).
- If a migration adds a column, add a `not null default` or ensure all existing rows get backfilled before adding a not-null constraint.
- Service role grants belong in their own migration (see 0014) to keep permission changes auditable.
- Function `search_path` must be set explicitly to prevent injection (see 0023, 0024).

Apply locally with `supabase db reset` (fresh) or `supabase migration up` (incremental).

---

## UI & Components

### Styling

Tailwind CSS v4. Use utility classes directly. Do not write custom CSS unless Tailwind can't express it. Global styles (CSS custom properties, base resets) go in `app/globals.css`.

### Component Naming

- Files: `kebab-case.tsx` (e.g., `inbox-workspace.tsx`)
- Component functions: `PascalCase` (e.g., `InboxWorkspace`)
- Shell components: `[Domain]Shell` pattern (e.g., `SettingsShell`, `DashboardShell`)

### Props

Prefer explicit typed props interfaces over inlined types for components that are more than trivially simple:

```typescript
interface ConversationCardProps {
  conversation: Conversation
  isSelected: boolean
  onSelect: (id: string) => void
}
```

### shadcn/ui

Use shadcn/ui components as the primitive layer for interactive UI (buttons, dialogs, dropdowns, forms). Don't reinvent these. Import from the component's path as configured in the project.

---

## Dates & Times

All timestamps are stored as `timestamptz` (UTC) in the database.

Format for display: use `Intl.DateTimeFormat` or a lightweight date utility — no heavy date libraries unless already a dependency. Always display in the user's local timezone.

The `created_at` and `updated_at` columns on all tables are maintained by database defaults and triggers. Don't set `updated_at` manually in application code — let the trigger handle it.

---

## Integrations

### AI Calls

All AI calls go through `lib/ai/index.ts`. Never call the OpenAI SDK directly from a route handler. This ensures the circuit breaker, timeout, and provider abstraction apply consistently.

Always pass `prompt_version` when generating drafts — it's a non-null column in `ai_drafts` and is required for auditability. Increment the version whenever the prompt structure meaningfully changes.

### Email Channels

Treat Gmail as one adapter, not the email domain model. New inbound provider work should normalize into `NormalizedInboundEmail` in `lib/email-connector/inbound.ts`, then call `processInboundEmail()`. Provider-specific code may fetch, authenticate, or parse external payloads, but conversation/contact/company/SLA/workflow logic should remain provider-neutral.

Custom inbound channels are configured through Settings -> Channels and managed by `/api/email/custom-inbound`. This route requires `integrations.manage`. Public deliveries go to `/api/inbound/email?channelId=<channel_id>` and must include the channel secret.

Mailbox setup records live in `email_connections`. Keep `connection_type` and `provider` separate: `connection_type` is the auth/setup mode (`oauth`, `mailbox_password`, `app_password`, `imap_smtp`, `custom_inbound`), while `provider` is the actual mailbox family (`gmail`, `microsoft365`, `outlook`, `exchange`, `zoho`, `icloud`, `custom`, `custom_inbound`). Do not store setup method names in `provider`.

### Gmail

Never store raw OAuth tokens or mailbox credentials in the database. Always encrypt via `lib/email-connector/encryption.ts` before writing to `email_connections`. Decrypt immediately before use. The encryption key must never be logged.

Token refresh is handled automatically by the Gmail sender/importer — they detect expired access tokens and use the refresh token. Watch expiry (7-day Gmail limit) is handled by the cron renewal endpoint.

### Stripe

No Stripe SDK. All Stripe calls use direct `fetch` to the Stripe REST API with the secret key. Webhook verification uses HMAC-SHA256 via `lib/stripe.ts`. The webhook handler must verify the signature before processing any event.

---

## Testing

Automated tests use Jest for focused `lib/` coverage. Add tests next to the helper being changed, usually under `src/lib/**/__tests__/`.

Manual testing uses:

- **Demo routes** (`/demo/*`) — serve mock data from `lib/mock-data.ts`. These can be used to verify UI without any auth or real data.
- **`/api/email/gmail/diagnostics`** — debug endpoint for Gmail connection state.
- **Settings -> Channels** — custom inbound channel endpoint/secret/status diagnostics.
- **Supabase local** (`supabase start`) — local Postgres instance for DB testing against migrations.

---

## Naming Conventions

### Database

| Object | Convention | Example |
|---|---|---|
| Tables | `snake_case`, plural | `knowledge_entries` |
| Columns | `snake_case` | `org_id`, `auth_user_id` |
| Enums | `snake_case` type name | `user_role`, `risk_level` |
| Enum values | `snake_case` | `waiting_on_customer` |
| Indexes | `idx_<table>_<columns>` | `idx_conversations_org_status` |
| Policies | Descriptive quoted string | `'org_isolation'` |
| Functions | `snake_case` | `get_org_id_for_user()` |

### TypeScript

| Object | Convention |
|---|---|
| Files | `kebab-case.ts` / `kebab-case.tsx` |
| React components | `PascalCase` function, `kebab-case` filename |
| Interfaces / Types | `PascalCase` |
| Constants | `SCREAMING_SNAKE_CASE` for true constants; `camelCase` for module-scoped values |
| Functions / variables | `camelCase` |
| Boolean props/vars | `is*` or `has*` prefix (`isSelected`, `hasError`) |

### API Routes

URL path segments: `kebab-case`. Dynamic segments: `[camelCase]`.

```
/api/conversations/[conversationId]/edit-analysis
/api/email/gmail/renew-watches
```

### Environment Variables

`SCREAMING_SNAKE_CASE`. Public variables (accessible in the browser) prefixed `NEXT_PUBLIC_`. Secret variables have no prefix and must never be included in client bundles.

Rate-limit policy overrides use the format `SECURITY_RATE_LIMIT_<POLICY_ID>_<SETTING>`, where `<POLICY_ID>` is uppercased and hyphens become underscores. Supported settings are `WINDOW_MS`, `MAX_REQUESTS`, and `BLACKLIST_AFTER`.

*Last updated: April 2026*
