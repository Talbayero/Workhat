# Data Access And RLS

Work Hat uses Supabase Auth plus `public.users` as the application identity layer.

## Identity Mapping

The canonical mapping is:

```text
auth.users.id -> public.users.auth_user_id -> public.users.org_id
```

RLS helper functions such as `public.current_org_id()` and `public.current_user_has_capability(...)` derive the current tenant and capability state from that mapping. Those helpers must remain `SECURITY DEFINER` functions with an explicit `search_path` so policies can resolve the current user without being blocked by RLS on `public.users`.

## Tenant-Scoped Tables

Org-owned product tables must include `org_id` and must scope authenticated access to `public.current_org_id()`.

Core tenant tables include:

- `public.users`
- `public.organizations`
- `public.channels`
- `public.companies`
- `public.contacts`
- `public.conversations`
- `public.messages`
- `public.ai_drafts`
- `public.sent_replies`
- `public.edit_analyses`
- `public.knowledge_entries`
- `public.knowledge_chunks`
- `public.qa_reviews`
- `public.qa_follow_ups`
- `public.org_sla_policies`
- `public.context_objects`
- `public.context_object_versions`

Cross-org reads are not allowed. A user in Org A must not be able to read Org B conversations, messages, contacts, companies, knowledge entries, users, or workflow records.

## Grants And Policies

Postgres requires both base table privileges and passing RLS policies. A valid RLS policy alone is not enough. The `authenticated` role needs the minimum grants required for the product path, and RLS must still enforce org scope.

The production inbox regression happened because authenticated reads reached tables with RLS policies but did not have the required base privileges in production. The symptom was `permission denied for table users` and `permission denied for table conversations`.

The repair path is:

- `0042_rls_inbox_read_repair.sql`: restores authenticated base grants for RLS-protected org tables.
- `0047_email_connection_metadata_grants.sql`: revokes broad authenticated `email_connections` reads and re-grants only conservative non-secret metadata columns.

## Email Connection Secrets

`public.email_connections` stores encrypted provider token material. Authenticated user-scoped reads must not expose:

- access token ciphertext
- refresh token ciphertext
- OAuth client secrets
- webhook secrets
- service role keys
- provider internals not needed by the UI

User-facing routes may read non-secret metadata such as provider, connected mailbox address, status, sync status, last sync time, and error state. Token reads and mailbox operations must stay server-side.

Authenticated users receive metadata-only access to `public.email_connections`. The default user-scoped grant intentionally excludes `access_token_ciphertext`, `refresh_token_ciphertext`, `diagnostics_json`, and `credential_metadata`. Those fields may contain encrypted credentials or sensitive operational detail and must stay behind trusted server-side routes unless a future review proves a narrower field is safe to expose.

`provider_metadata` is allowed only for non-secret provider state such as provider hints, Gmail profile/watch metadata, setup timestamps, and adapter status. Do not store access tokens, refresh tokens, OAuth secrets, webhook secrets, mailbox passwords, app passwords, or service credentials in `provider_metadata`.

## Service Role Usage

Service-role access is allowed for:

- Gmail OAuth callback token storage
- Gmail sync, watch renewal, and push import handling
- outbound mailbox send operations
- server-side diagnostics for admins
- migrations, backfills, and scheduled maintenance

Service-role access must never:

- return all org data without resolving the authenticated user first
- trust frontend-provided org IDs
- expose token ciphertext or provider secrets to the browser
- become the normal read path when authenticated RLS reads work

## Temporary Admin Fallbacks

Some inbox read paths keep tenant-scoped admin fallbacks as production resilience. They are acceptable only when all of these are true:

- the route has authenticated the current user
- the app user row has resolved the user's `org_id`
- the admin query is explicitly filtered by that `org_id`
- logs identify whether the query source was `user` or `admin-fallback`

Once production diagnostics show healthy user-scoped reads over time, remove these fallbacks in a narrow cleanup pass.

## Production Verification

After applying RLS/grant migrations in Supabase production:

1. Open `/api/email/gmail/diagnostics` as an admin or integration manager.
2. Confirm `userScopedReadDiagnostics.appUserId` and `orgId` are populated.
3. Confirm these checks report `ok: true`:
   - `users`
   - `organizations`
   - `channels`
   - `companies`
   - `contacts`
   - `conversations`
   - `messages`
   - `knowledgeEntries`
   - `qaFollowUps`
   - `emailConnectionMetadata`
4. Open `/inbox` and confirm server logs show `querySource: "user"` for `getConversations`.
5. Open `/inbox/[conversationId]` and confirm thread messages load.
6. Call `/api/conversations/count` and confirm it returns a count without using the fallback.
7. Confirm settings channel readiness still works without exposing token fields.

Keep the tenant-scoped fallbacks until the production logs consistently show user-scoped reads.
