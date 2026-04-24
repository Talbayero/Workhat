# Security Hardening Documentation

> Updated: April 2026  
> Status: Active

This document details the security hardening infrastructure added to Work Hat CRM in April 2026, including capability-based authorization, immutable audit logging, rate limiting, and data protection policies.

## Table of Contents

1. [Authorization & Capabilities](#authorization--capabilities)
2. [Audit Logging](#audit-logging)
3. [API Rate Limiting](#api-rate-limiting)
4. [Data Protection & Retention](#data-protection--retention)
5. [Admin Client & Fallback Strategy](#admin-client--fallback-strategy)
6. [Input Validation Strategy](#input-validation-strategy)
7. [Webhook Security](#webhook-security)
8. [Mailbox Credential Security](#mailbox-credential-security)
9. [Error Handling & Logging](#error-handling--logging)
10. [Incident Response](#incident-response)

---

## Authorization & Capabilities

### Overview

Work Hat uses a **capability-based authorization system** that provides fine-grained access control beyond simple role-based checks. Instead of asking "Is this user an admin?", we ask "Does this user have the `billing.manage` capability?"

### Architecture

```
User
  ├─ Base Role (admin, manager, agent, qa_reviewer)
  │  └─ Mapped to Role Preset in role_capabilities table
  │
  └─ Per-Org Overrides (user_capability_overrides)
     ├─ "grant" effects: add capabilities to role preset
     └─ "revoke" effects: remove capabilities from role preset
```

### 16 Capabilities

| Capability | Purpose | Who has it by default |
|---|---|---|
| `conversations.read` | View conversation list | admin, manager, agent, qa_reviewer |
| `conversations.reply` | Send replies to conversations | admin, manager, agent |
| `conversations.assign` | Assign conversations to users | admin, manager |
| `records.manage` | Create/edit contacts, companies | admin, manager |
| `ai.generate` | Generate AI drafts | admin, manager, agent |
| `ai.configure` | Configure AI prompts/models | admin, manager |
| `knowledge.read` | Read knowledge base | admin, manager, agent, qa_reviewer |
| `knowledge.edit` | Create/edit knowledge entries | admin, manager |
| `qa.review` | Submit QA reviews | admin, manager, qa_reviewer |
| `settings.manage` | Org settings, integrations | admin |
| `billing.manage` | Manage billing, subscriptions | admin, manager |
| `integrations.manage` | Configure integrations | admin, manager |
| `team.manage` | Manage users, roles | admin |
| `team.invite` | Invite users | admin, manager |
| `team.skills.manage` | Configure agent skills | admin, manager |
| `audit.read` | View audit logs | admin, manager, qa_reviewer |

### Usage in Code

**Checking capabilities:**

```typescript
import { hasCapability, requireCapability } from "@/lib/auth/capabilities";
import type { Capability } from "@/lib/auth/capabilities";

// Check if user has a capability
if (await hasCapability(appUser, "billing.manage")) {
  // User can manage billing
}

// Require capability or return 403
const permissionError = await requireCapability(appUser, "billing.manage");
if (permissionError) return permissionError;
```

**In API route handlers:**

```typescript
export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check capability for this operation
  const forbidden = await requireCapability(appUser, "billing.manage", "update_subscription");
  if (forbidden) return forbidden;

  // Proceed with operation
  // ...
}
```

### Current Route Coverage

As of the April 2026 hardening pass, authenticated write routes are expected to enforce explicit app-layer capabilities before relying on Supabase RLS. This is important for SOC 2 access-control evidence because capability revocations must affect API behavior even when an org-scoped RLS policy is broad.

| Operation | Required capability |
|---|---|
| Send customer reply or post internal note | `conversations.reply` |
| Update conversation status, priority, assignment, tags, or intent | `conversations.assign` |
| Create contacts, companies, or manual conversations | `records.manage` |
| Generate AI drafts | `ai.generate` |
| Configure prompt experiments | `ai.configure` or `settings.manage` |
| Create or update knowledge entries | `knowledge.edit` |
| Submit QA reviews | `qa.review` |
| Manage org/SLA/team settings | `settings.manage`, `team.manage`, or related capability |

The route scan used during hardening checks authenticated `POST`, `PATCH`, `PUT`, and `DELETE` handlers that call `getCurrentAppUser()` and confirms they also call `requireCapability()` or `requireAnyCapability()`.

### Conversation Status Vocabulary

The org-scoped migration path uses the `conversation_status` enum values `open`, `closed`, `waiting_on_customer`, and `waiting_on_internal`. Application code must not write legacy text statuses such as `resolved`, `archived`, or `in_progress` unless a future migration first adds those enum values.

Operationally:

- Closing a conversation writes `closed`.
- SLA refresh treats only `closed` as terminal.
- Queue health and open-count queries filter active work with the migration-backed status set.
- Audit action names such as `conversation.resolved` are event labels and are not database status values.

### Capability Override Precedence

When resolving a user's capabilities:

1. **Start with role preset** — Look up the user's role in `role_capabilities` table
2. **Apply grants** — Add any capabilities from overrides with `effect = 'grant'`
3. **Apply revokes** — Remove any capabilities with `effect = 'revoke'`
4. **Last-write-wins** — If same capability is granted and revoked, last action wins

### Edge Cases & Safeguards

**Admin client unavailable:**
If the database is temporarily unavailable, the authorization system falls back to the role preset for that user. This ensures the system degrades gracefully rather than failing open or closed.

```typescript
const capabilities = await getMappedCapabilities(user, "operation");
// If admin client unavailable → uses role preset
// If DB query fails → uses role preset
```

**Org isolation:**
All capability overrides are scoped to a user's organization:

```sql
SELECT capability, effect
FROM user_capability_overrides
WHERE org_id = :user_org_id   -- explicit org filter
  AND user_id = :user_id;
```

This prevents users from different organizations from affecting each other's permissions.

**Concurrent writes:**
Capability overrides are applied in sequence (grant/revoke order in the response), ensuring deterministic results even under concurrent writes.

### Testing Capabilities

When testing authorization, use the fixtures in `src/__tests__/fixtures/auth.fixtures.ts`:

```typescript
import { createAdminUser, createAgentUser, createManagerUser } from "@/__tests__/fixtures/auth.fixtures";

// Test admin has all capabilities
const admin = createAdminUser();
expect(await hasCapability(admin, "billing.manage")).toBe(true);

// Test agent doesn't have billing
const agent = createAgentUser();
expect(await hasCapability(agent, "billing.manage")).toBe(false);
```

---

## Audit Logging

### Overview

Every security-relevant action in Work Hat is logged to an immutable `audit_logs` table. These logs cannot be edited or deleted, ensuring compliance with regulatory requirements (GDPR, SOC 2, etc.).

### 26 Audit Action Types

Audit actions fall into categories:

| Category | Actions |
|---|---|
| **Auth** | `auth.login`, `auth.logout`, `auth.login_failed`, `auth.password_reset`, `auth.mfa_enrolled`, `auth.mfa_verified` |
| **User Management** | `user.created`, `user.updated`, `user.role_changed`, `user.deactivated`, `user.deleted`, `user.invite_sent` |
| **Org Settings** | `org.settings_updated`, `org.name_changed` |
| **Contacts & Companies** | `contact.created`, `contact.updated`, `contact.deleted`, `company.created`, `company.updated`, `company.deleted` |
| **Knowledge** | `knowledge.created`, `knowledge.updated`, `knowledge.deleted` |
| **Conversations** | `conversation.created`, `conversation.updated`, `conversation.resolved`, `conversation.archived`, `conversation.assigned`, `conversation.deleted` |
| **AI** | `ai.draft_generated`, `ai.draft_accepted`, `ai.draft_edited` |
| **Billing** | `billing.plan_changed`, `billing.payment_succeeded`, `billing.payment_failed` |
| **Security** | `security.rate_limit_hit`, `security.suspicious_request`, `security.webhook_auth_failed` |
| **Data Subject Rights** | `data.export_requested`, `data.deletion_requested` |
| **Intent Configuration** | `intent.created`, `intent.updated`, `intent.deleted`, `intent.correction_submitted` |
| **QA** | `qa.review_submitted` |

### Audit Log Schema

```typescript
interface AuditEvent {
  action: AuditAction;           // What happened
  orgId?: string;                // Which organization
  actorId?: string;              // Who did it
  actorEmail?: string;           // Actor's email
  actorRole?: string;            // Actor's role
  resourceType?: string;         // What was affected (e.g., "user", "conversation")
  resourceId?: string;           // ID of resource
  resourceLabel?: string;        // Human-readable label (email, name, etc.)
  oldValues?: Record<...>;       // State before change
  newValues?: Record<...>;       // State after change
  success?: boolean;             // Did operation succeed?
  errorMessage?: string;         // Error details if failed
  ipAddress?: string;            // Requester's IP
  userAgent?: string;            // Browser/client info
}
```

### Usage in API Handlers

**After a successful operation:**

```typescript
import { logAudit } from "@/lib/security/audit-logger";

// User changes their role
await updateUserRole(userId, newRole);

await logAudit({
  action: "user.role_changed",
  orgId: appUser.org_id,
  actorId: appUser.id,
  actorEmail: appUser.email,
  actorRole: appUser.role,
  resourceType: "user",
  resourceId: userId,
  resourceLabel: targetUserEmail,
  oldValues: { role: "agent" },
  newValues: { role: "manager" },
  success: true,
  req,  // Extracts IP and user-agent automatically
});
```

**On error:**

```typescript
try {
  await dangerousOperation();
} catch (err) {
  await logAudit({
    action: "user.updated",
    orgId: appUser.org_id,
    actorId: appUser.id,
    resourceType: "user",
    resourceId: userId,
    success: false,
    errorMessage: err instanceof Error ? err.message : "Unknown error",
    req,
  });
  throw err;
}
```

### Audit Log Retention

By default, audit logs are retained for 2 years. Organizations can configure shorter retention periods via `data_retention_policies` table.

The system automatically deletes audit logs older than the retention period via a scheduled job (frequency: TBD).

### Audit Log Access

Only users with the `audit.read` capability can access audit logs via `/api/audit-logs`.

---

## API Rate Limiting

### Overview

Work Hat uses Upstash Redis for distributed rate limiting, protecting against abuse and DoS attacks.

### Configuration

**Environment variables:**

```
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
SECURITY_RATE_LIMIT_KEY_PREFIX=workhat:ratelimit:
SECURITY_RATE_LIMIT_WINDOW_MS=60000        # 1 minute window
SECURITY_RATE_LIMIT_MAX_REQUESTS_PER_WINDOW=100
```

### Rate Limit Tiers

| Tier | Authenticated | Unauthenticated | Application |
|---|---|---|---|
| Public/Webhook | — | 1000/min per IP | Inbound email, Stripe webhooks |
| Onboarding | 8/min per user/IP | 8/min per IP before auth rejection | Organization bootstrap |
| API | 500/min per user | 100/min per IP | Dashboard, integrations |
| Critical | 10/min per user | — | Password reset, MFA enrollment |

### Triggering Rate Limits

Rate limiting is enforced in `proxy.ts`:

```typescript
// In proxy.ts
const gatewayResponse = await guardApiRequest(request, { phase: "pre-auth" });
if (gatewayResponse) return gatewayResponse;  // Rate limit hit
```

When a user exceeds their limit:

```json
{
  "error": "Rate limit exceeded. Please try again in 1 minute.",
  "retryAfter": 45
}
```

An audit log is created:

```typescript
await logSecurityEvent("security.rate_limit_hit", {
  req,
  orgId: appUser?.org_id,
  detail: `User exceeded ${tier} rate limit`,
});
```

### Monitoring

Check Redis usage via Upstash dashboard. If rate-limit data is lost (Redis reset), the system continues without rate limiting (degrades gracefully).

Production routes normally fail closed when the Redis-backed rate-limit store is unavailable. The exception is `/api/org/create`: onboarding still requires a valid Supabase session and request validation, but it fails open on rate-limit-store outage so first-run setup is not blocked by missing or transient Upstash configuration. Static IP blacklist, suspicious-header checks, method checks, and body-size limits still run.

---

## Data Protection & Retention

### Data Retention Policies

Organizations can configure how long data is retained:

```typescript
interface DataRetentionPolicy {
  org_id: uuid;
  data_type: "conversations" | "messages" | "audit_logs";
  retention_days: integer;  // null = retain forever
}
```

### Data Subject Access Requests (DSAR)

Users can request their data via `POST /api/account/data`:

```json
{
  "type": "export",
  "format": "json"
}
```

The system:
1. Creates a `data_deletion_request` record
2. Logs the request: `data.export_requested`
3. (Async) Exports data to a secure signed URL
4. User retrieves export within 7 days

### Data Deletion Requests

Users can request deletion of all their data:

```json
{
  "type": "deletion"
}
```

The system:
1. Creates a `data_deletion_request` record with status `pending_manual_review`
2. Logs: `data.deletion_requested`
3. (Manual) Team reviews and approves deletion
4. (Async) Soft-deletes or purges records
5. Logs: `data.deleted` audit entry

---

## Admin Client & Fallback Strategy

### Overview

The "admin client" is the Supabase service-role client, which bypasses RLS to perform system-level operations (capability lookups, audit logging, etc.).

### Fallback Behavior

If the admin client is unavailable:

| Operation | Fallback | Impact |
|---|---|---|
| Capability lookup | Use role preset | User gets base role permissions (safe) |
| Audit logging | Swallow error, continue | Audit log not written (not ideal) |
| Data retention cleanup | Skip until retry | Data not deleted (compliance risk) |

### Creating the Admin Client

```typescript
import { createOptionalAdminClient } from "@/lib/supabase/admin";

const { client, reason } = createOptionalAdminClient();
if (!client) {
  console.warn(`Admin client unavailable: ${reason}`);
  // Fallback or error handling
}
```

**Possible reasons:**
- `SUPABASE_SERVICE_ROLE_KEY not set`
- `NEXT_PUBLIC_SUPABASE_URL not set`
- Network/connectivity issue (transient)

### Monitoring

- Monitor logs for `[admin-client]` warnings
- Set up alerting on repeated unavailability
- Test admin client health in startup checks

---

## Input Validation Strategy

### Principles

1. **Type check first** — Ensure JSON is an object, not a string/array/null
2. **Trim & normalize** — Remove leading/trailing whitespace
3. **Length cap** — Prevent resource exhaustion
4. **Format validation** — Regex checks for email, domain, etc.
5. **Never trust client** — All validation happens server-side

### Common Patterns

**Normalize optional string:**

```typescript
function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;  // Trim, convert empty to null
}
```

**Validate & cap length:**

```typescript
const maxLength = 200;
if (name && name.length > maxLength) {
  return NextResponse.json(
    { error: `Name exceeds ${maxLength} characters` },
    { status: 422 }
  );
}
```

**Validate email:**

```typescript
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const email = value.toLowerCase();
if (!EMAIL_RE.test(email)) {
  return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
}
```

### Validation Schema Library (Future)

To reduce duplication, validation will migrate to Zod schemas:

```typescript
import { z } from "zod";

const CreateCompanySchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().regex(/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i).optional(),
  industry: z.string().max(100).optional(),
  tier: z.enum(["standard", "pro", "enterprise", "vip"]),
  tags: z.array(z.string().max(50)).max(20),
});

const body = CreateCompanySchema.parse(await req.json());
```

---

## Webhook Security

Public webhook routes are unauthenticated by Supabase session, so each route must verify its own caller identity before processing side effects.

### Custom Inbound Email

`POST /api/inbound/email` is the supported non-Gmail inbound email path. Security controls:

- Per-channel shared secrets are generated from Settings -> Channels and stored as one-way hashes in `channels.config_json.webhook_secret_hash`.
- Callers pass the secret through `Authorization: Bearer <token>`, `X-WorkHat-Inbound-Token`, or `X-Inbound-Token`.
- The route validates JSON shape and caps normalized subject/body/header lengths before domain processing.
- The org/channel is resolved from a signed channel id (`?channelId=<uuid>`) or a configured recipient address; no user-supplied org id is accepted.
- Idempotency is enforced with `inbound_email_events.dedupe_key` plus `messages.channel_message_id` checks.
- Bad tokens are logged as `security.suspicious_request` when the target channel can be resolved.
- Delivery status, last success, and last error are stored on channel diagnostics and in `inbound_email_events`.

Legacy `POSTMARK_INBOUND_TOKEN` is accepted only when a channel has no per-channel token, to preserve old webhook setups during migration.

---

## Mailbox Credential Security

OAuth tokens, mailbox passwords, app passwords, and IMAP/SMTP passwords are encrypted before being written to `email_connections`. The shared encryption layer uses `EMAIL_TOKEN_ENCRYPTION_KEY`, and decrypted values must only exist in memory inside trusted server routes or `lib/email-connector/adapters/` runtime code.

Gmail OAuth starts at `/api/email/gmail/connect` or compatibility alias `/api/oauth/google/start`, then returns to `/api/email/gmail/callback`. The start route sets a short-lived HTTP-only state cookie and the callback rejects missing or mismatched state before exchanging a code. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_TOKEN_ENCRYPTION_KEY`, and `GOOGLE_OAUTH_REDIRECT_URI_CONFIRMED=true` are required before Gmail can be offered in the UI.

Security controls:

- `provider` and `connection_type` are separate so setup methods are not mistaken for trusted provider identities.
- Saving a credential record writes `status = configured`; activation requires adapter validation.
- During validation the connection moves to `validating`, then either `active` or `error`.
- `diagnostics_json`, `credential_metadata`, and `provider_metadata` may store hostnames, ports, TLS flags, timestamps, and error categories, but never plaintext secrets.
- `last_error_code` and `last_error_message` use operator-safe messages such as `imap_auth_failed`, `smtp_auth_failed`, `tls_failed`, or `app_password_required`; raw provider stack traces must stay in server logs only.
- Onboarding and Settings should only treat `active` inbound-enabled connections as mailbox-ready.
- SMTP send remains behind the `conversations.reply` capability and the existing human approval route.
- Scheduler polling uses `GET /api/email/mailbox/poll` with `Authorization: Bearer <CRON_SECRET>`.

Credential rotation is explicit: the operator reconnects or updates the mailbox setup, causing Work Hat to encrypt the new secret and re-run validation. Existing custom inbound webhook tokens are rotated separately through token regeneration and are stored as one-way hashes.

---

## Error Handling & Logging

Self-serve setup surfaces must not expose raw environment variable names, database constraint names, stack traces, or provider exception strings to normal users. API routes should translate setup failures into actionable user messages, for example:

- "Google OAuth is not configured by your workspace admin."
- "Mailbox credential storage is not configured."
- "This provider requires OAuth or an app password."
- "Mailbox credentials were rejected."
- "IMAP access appears disabled."

Admin-only diagnostics may expose exact missing environment variables and setup prerequisites through Settings -> Channels and `/api/system/setup-health`, which requires `settings.manage`.

### Error Response Format

All API errors follow this format:

```json
{
  "error": "User-friendly error message",
  "requestId": "req-abc123def456"  // (optional) for support tickets
}
```

**HTTP status codes:**
- `400` — Bad request (validation failed)
- `401` — Unauthorized (no auth session)
- `403` — Forbidden (auth success, but insufficient permissions)
- `404` — Not found
- `422` — Unprocessable entity (validation semantic error)
- `429` — Too many requests (rate limit)
- `500` — Internal server error

### Structured Logging

The system logs to stdout with structured format (to be piped into a logging backend):

```json
{
  "timestamp": "2026-04-22T10:30:00Z",
  "level": "error",
  "service": "api",
  "route": "/api/conversations",
  "method": "POST",
  "requestId": "req-...",
  "userId": "user-...",
  "orgId": "org-...",
  "statusCode": 500,
  "message": "Database connection failed",
  "error": "connect ECONNREFUSED 127.0.0.1:5432"
}
```

### Audit Logging on Auth Failure

Failed capability checks should be logged:

```typescript
// In requireCapability():
if (!hasCapability) {
  await logAudit({
    action: "security.suspicious_request",  // or specific auth action
    orgId: appUser.org_id,
    actorId: appUser.id,
    resourceType: "capability",
    resourceId: capability,
    success: false,
    errorMessage: `User attempted to access ${capability} without permission`,
    req,
  });
  return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
}
```

---

## Incident Response

### Security Incident Types

| Severity | Example | Response Time |
|---|---|---|
| **Critical** | Unauthorized data access, audit log corruption | < 1 hour |
| **High** | Credential compromise, RLS bypass | < 4 hours |
| **Medium** | Rate limit bypass, unexpected permission grant | < 24 hours |
| **Low** | Invalid audit action logged, harmless config error | < 1 week |

### Response Workflow

1. **Detect** — Monitor logs, alerts, or user reports
2. **Assess** — Determine severity, affected users/data, root cause
3. **Contain** — Revoke compromised credentials, disable accounts, apply mitigations
4. **Communicate** — Notify affected users if needed
5. **Remediate** — Fix the root cause
6. **Post-Mortem** — Document what happened and how to prevent it

### Checking Audit Logs

**Get recent audit logs for an organization:**

```bash
curl https://api.workhat.app/api/audit-logs?orgId=...&limit=100
```

**Filter by action type:**

```bash
curl https://api.workhat.app/api/audit-logs?action=security.suspicious_request&since=2026-04-22T00:00:00Z
```

**Check for unauthorized capability changes:**

```bash
# Look for:
# - Multiple failed auth.login attempts from same IP
# - Unexpected user.role_changed entries
# - Grant overrides from non-admin users
```

### Critical Procedures

**If audit logging is compromised:**
- Immediately check Redis + DB connectivity
- Review recent admin client logs for failures
- Check for unexpected `logAudit()` errors
- If data loss suspected, escalate to Data team for backup recovery

**If RLS is breached:**
- Check `web/src/app/api` for missing `.eq("org_id", ...)` filters
- Review recent DB migrations for RLS policy changes
- Check for service-role API calls without org_id filters
- Consider temporary read-only mode while investigating

**If rate limiting fails (Redis down):**
- System continues without rate limiting (degrades)
- Monitor for unusual traffic spikes
- Implement temporary IP whitelist if needed
- Restore Redis, rate limiting resumes automatically

### Escalation Contacts

- **Database/Infrastructure:** DevOps team
- **Security/Compliance:** Security team  
- **Legal (GDPR/DSARs):** Legal team
- **Customer Communication:** Support/Customer Success

---

## Further Reading

- [Architecture](./architecture.md) — System design and integration points
- [Conventions](./conventions.md) — Code style and patterns
- [Decisions](./decisions.md) — Architecture decision records
- [On-Call Runbook](./on-call-runbook.md) — Incident response procedures

---

*Last updated: April 22, 2026*
