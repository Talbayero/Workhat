# Architecture

Work Hat is a Next.js App Router application backed by Supabase. The architecture is conversation-first: channel-specific inputs normalize into conversations and messages, then AI, SLA, workflow, QA, and improvement systems operate on the normalized record.

## Runtime Stack

| Layer | Technology | Notes |
|---|---|---|
| Web/API | Next.js App Router, TypeScript | Route handlers stay thin and call `lib/` domain services |
| Auth | Supabase Auth | Password signup/login/reset, server-side `getUser()` session validation |
| Database | Supabase Postgres | Org-scoped tables, migrations, RLS direction, audit/evidence records |
| AI | OpenAI through provider abstraction | Draft generation with prompt version persistence |
| Email MVP | Gmail OAuth | Work Hat-owned OAuth app; canonical callback: `https://work-hat.com/api/oauth/google/callback` |
| Rate limiting | Upstash Redis where configured | Request protection and abuse controls |
| Hosting | Vercel | Serverless route handlers and cron-compatible endpoints |

## System Boundary

In scope for the application boundary:

- Work Hat user accounts.
- Organizations/workspaces.
- Gmail OAuth mailbox connections.
- Conversations and messages.
- Contacts and companies.
- AI drafts and edit analysis.
- Knowledge entries.
- SLA snapshots and queue health.
- Workflow events/rules/executions.
- QA reviews.
- Audit logs and security events.

Out of scope for the current MVP boundary:

- Non-Gmail mailbox self-serve setup. IMAP/SMTP, app password, mailbox password, and custom inbound are not allowed in the MVP path.
- SMS and chat channels.
- Autonomous AI replies.
- Visual workflow automation.

## Identity Model

Work Hat account identity and connected mailbox identity are separate.

- A user signs in to Work Hat with a Supabase Auth account.
- The user creates or joins an organization.
- The organization connects the Gmail mailbox Work Hat should manage.
- The connected Gmail account can differ from the user's Work Hat login email.

This separation must be visible in user copy and support workflows.

## Authentication Flow

Supported auth flows:

- Create account.
- Log in.
- Forgot password.
- Reset password.
- Invite activation.
- Workspace creation after first login.

Protected app routes validate sessions through Supabase server-side user checks. API routes use `getCurrentAppUser()` to resolve the application user and organization context.

## Authorization Model

Work Hat uses role presets plus capabilities.

Default roles:

- `admin`
- `manager`
- `agent`
- `qa_reviewer`

Capabilities control sensitive behavior such as:

- `conversations.read`
- `conversations.reply`
- `conversations.assign`
- `records.manage`
- `ai.generate`
- `knowledge.edit`
- `qa.review`
- `settings.manage`
- `integrations.manage`
- `team.manage`
- `audit.read`

Authenticated write routes must check capabilities before mutating data. RLS and org filters are defense-in-depth, not a replacement for app-layer authorization.

## Tenant Isolation

Every tenant-owned table uses `org_id` or an equivalent scoped relationship. Application queries must filter by the current user's `org_id`. Service-role writes are allowed only in trusted server paths where the route has already authenticated and authorized the caller or where the source is a verified system webhook.

Security expectation:

- No cross-org reads.
- No cross-org writes.
- No global identifiers accepted without org verification.
- Audit/evidence tables preserve org context where applicable.

## Conversation Data Flow

```text
Gmail message
  -> Gmail adapter
  -> Normalized inbound email
  -> Contact/company resolution
  -> Conversation threading or creation
  -> Message insert
  -> SLA refresh
  -> Workflow event emission
  -> Inbox/queue visibility
```

Reply flow:

```text
Conversation
  -> AI draft
  -> Human edit/approval
  -> Gmail send
  -> sent_replies and outbound message records
  -> edit analysis
  -> audit/workflow evidence
```

## Gmail OAuth MVP

Gmail OAuth is the only self-serve email channel for the MVP. Work Hat owns and operates one platform Google OAuth client for all tenants. Customers only approve access to their Gmail or Google Workspace mailbox; they do not configure Google Cloud, OAuth credentials, redirect URIs, or hosting environment variables.

Canonical routes:

- `GET /api/oauth/google/start`
- `GET /api/oauth/google/callback`

Platform-owner environment variables:

- `APP_BASE_URL=https://work-hat.com`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `EMAIL_TOKEN_ENCRYPTION_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional operational variables:

- `GOOGLE_PUBSUB_TOPIC`
- `GMAIL_PUSH_TOKEN`
- `CRON_SECRET`
- Upstash Redis variables for rate limiting.

OAuth scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`

Platform Google Cloud setup, performed once by Work Hat:

- Configure OAuth consent for the Work Hat-owned Google project.
- Enable Gmail API.
- Register `https://work-hat.com/api/oauth/google/callback` as the authorized redirect URI.
- Keep the OAuth client ID and secret only in platform environment configuration.

Connection readiness requires an `email_connections` row with:

- `provider = 'gmail'`
- `connection_type = 'oauth'`
- `status = 'active'` or legacy `connected`
- `inbound_enabled = true`
- `outbound_enabled = true`

## AI Architecture

AI drafting is provider-abstracted under `lib/ai/`.

Rules:

- Every draft must store a non-null `prompt_version`.
- Draft generation requires `ai.generate`.
- AI output is a suggestion, not an autonomous send.
- Human edits are preserved for improvement analytics.
- Prompt experiments must have deterministic assignment and auditability.

## Feedback And Improvement

Work Hat learns from edit analysis:

- AI draft text.
- Human final reply.
- Deterministic diff metrics.
- LLM-assisted edit category where used.
- Prompt version.
- Knowledge references.
- Conversation and intent context.

Insights must remain explainable: repeated edit patterns, affected prompt versions, likely knowledge gaps, and source examples should be traceable.

## SLA And Queue Health

SLA state is computed from org-level policy and conversation/message timestamps. The system tracks:

- First response SLA.
- Next response SLA.
- At-risk state.
- Breached state.
- Aging buckets.
- Backlog pressure.

SLA refresh runs after inbound message creation and when operational state changes.

## Workflow Engine

The workflow engine is intentionally small:

- Events are emitted by domain code.
- Rules live in Postgres.
- Conditions are deterministic JSON comparisons.
- Actions are a fixed TypeScript allowlist.
- Execution is recorded in workflow execution tables.
- Rule actions do not recursively trigger open-ended automation.

Supported event families include:

- `conversation.created`
- `message.received`
- `draft.generated`
- `reply.sent`
- `conversation.updated`
- `risk.changed`
- `sla.breached`

## Audit Logging

Audit logs are compliance/security evidence. Workflow events are operational automation records. Do not conflate them.

Audit logs should capture:

- Auth events.
- Capability-sensitive actions.
- Settings/integration changes.
- Reply sends.
- AI draft generation where relevant.
- Security failures.
- Suspicious requests.
- Data subject request actions.

## Data Protection

Sensitive secrets are encrypted before storage when they must be reused, including Gmail access and refresh tokens. Plaintext secrets must not be logged.

Customer data includes:

- Conversation content.
- Contact/company records.
- Knowledge content.
- AI drafts.
- Edit analyses.
- Audit logs.

These records are in scope for confidentiality, privacy, retention, and deletion controls.

## Key Implementation Locations

| Area | Location |
|---|---|
| App routes | `web/src/app/` |
| Auth helpers | `web/src/lib/auth/` |
| Supabase clients | `web/src/lib/supabase/` |
| Email connectors | `web/src/lib/email/` |
| AI | `web/src/ai/` |
| Workflow | `web/src/lib/workflow-engine/` |
| SLA | `web/src/lib/sla/` |
| Audit/security | `web/src/lib/security/` |
| Migrations | `supabase/migrations/` |

Last updated: April 2026
