# Operations Runbook

This runbook covers production support, incident response, and the Gmail-only MVP path.

## Severity Levels

| Severity | Definition | Examples |
|---|---|---|
| SEV-1 | Customer data exposure, total outage, or inability to authenticate broadly | Cross-org access, production auth outage |
| SEV-2 | Core MVP path broken for many users | Gmail OAuth outage, send/import failure, AI draft outage |
| SEV-3 | Degraded but usable | Slow queue, non-critical diagnostics failure |
| SEV-4 | Low-risk issue or documentation/UI mismatch | Copy issue, isolated warning |

## Incident Response Steps

1. Declare severity and incident owner.
2. Capture start time, affected systems, and customer impact.
3. Contain the issue.
4. Preserve evidence: logs, deploy IDs, commits, screenshots, audit rows.
5. Communicate status internally and externally as appropriate.
6. Remediate.
7. Verify recovery.
8. Write postmortem for SEV-1/SEV-2.
9. Track follow-up actions to closure.

## MVP Path Health Check

The core path is healthy only if:

1. User can create account.
2. User can log in.
3. User can reset password.
4. User can create workspace.
5. User can connect Gmail via OAuth.
6. OAuth redirect URI is exactly `https://work-hat.com/api/oauth/google/callback`.
7. Gmail creates active `email_connections` row.
8. User can import latest email.
9. Email appears in Inbox.
10. User can generate AI draft.
11. User can edit/send reply.
12. Audit/logging records the flow.

Redis request protection should be configured before broader customer rollout. If Redis is missing, authenticated app APIs continue so setup is not blocked, but admin setup health must show Redis as incomplete and public abuse-prone routes may fail closed.

## Manual MVP Verification Checklist

Run this before claiming a deployment is ready for customer onboarding:

1. Open `/login` in a clean browser session.
2. Create a new Work Hat account with a real email address.
3. Confirm login works and the forgot-password flow sends a reset email.
4. Create a workspace from `/onboarding`.
5. Confirm the onboarding email step shows only Gmail OAuth and no IMAP, SMTP, app password, mailbox password, custom inbound, or non-Gmail provider choices.
6. Start Gmail OAuth from onboarding and confirm Google receives this exact redirect URI:

```text
https://work-hat.com/api/oauth/google/callback
```

7. Complete Google consent and confirm Work Hat returns to onboarding with a visible success or error alert.
8. In Settings -> Channels, confirm the connected mailbox section shows the Work Hat login identity separately from the connected Gmail mailbox identity.
9. Confirm the active `email_connections` row is:

```text
provider = gmail
connection_type = oauth
status = active
inbound_enabled = true
outbound_enabled = true
```

10. Click Import latest email and confirm the UI returns scanned/imported/skipped/errors counts.
11. Confirm at least one imported email appears in `/inbox` as a conversation.
12. Open the conversation and confirm the thread shows a "Replying to" card with the latest inbound customer message.
13. Confirm internal notes and activity/system events are visually separate from customer messages and outbound replies.
14. Confirm AI Draft is disabled with a reason if no latest inbound customer message exists.
15. Confirm Send is disabled with a reason when the reply is empty or the conversation is closed.
16. Open the automated/system queue filter and confirm system notifications are retained but excluded from the default operational queue.
17. Open Settings -> Appearance and verify Light, Dark, and System preferences apply and persist after refresh.
18. Generate an AI draft, edit it, and send.
19. Confirm the customer-facing reply is sent through Gmail, not simulated.
20. Confirm `messages`, `sent_replies`, `edit_analyses`, `inbound_email_events`, workflow events, and audit/log evidence exist for the flow.
21. Confirm onboarding does not advance past Gmail setup until Gmail is active, an import attempt has completed, and at least one inbox conversation is visible.
22. In Settings -> Channels, click Run MVP smoke check and confirm it passes Gmail active, import attempted, visible Gmail-imported conversation, AI provider configured, and Gmail outbound available.

## Deployment Readiness Checklist

Production-like readiness requires:

- `APP_BASE_URL=https://work-hat.com`
- `NEXT_PUBLIC_APP_URL=https://work-hat.com`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `EMAIL_TOKEN_ENCRYPTION_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- Applied Supabase migrations through the latest file in `supabase/migrations/`
- Settings -> Channels -> Admin setup health shows Google OAuth, token encryption, service role, Redis, and RLS read diagnostics as passing or intentionally warned
- `/api/email/gmail/diagnostics` shows user-scoped reads passing and no RLS repair required

## Gmail OAuth Troubleshooting

Check admin setup health:

- Settings -> Channels -> Admin setup health.
- `GET /api/system/setup-health`.

Platform-owner required values:

- `APP_BASE_URL=https://work-hat.com`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `EMAIL_TOKEN_ENCRYPTION_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Work Hat's Google Cloud project must include:

```text
https://work-hat.com/api/oauth/google/callback
```

Common failures:

| Symptom | Likely Cause | Action |
|---|---|---|
| `redirect_uri_mismatch` | Work Hat OAuth app redirect URI does not match production app | Platform owner adds exact callback URI |
| Gmail card disabled | Missing env var or setup health failure | Check admin setup health |
| Callback fails token exchange | Bad client secret, stale code, denied consent | Verify env and retry OAuth |
| Connection not active | Token persistence/import failed | Inspect email connection diagnostics and logs |
| Import returns no active Gmail | No active Gmail OAuth connection | Reconnect Gmail |
| Import reports `scanned: 0` | Gmail API did not return recent matching mail | Confirm the test email was delivered to the connected Gmail address, wait a few seconds, then import again |
| Import reports `scanned > 0` and `imported: 0` | Messages were already imported or skipped by dedupe | Open Inbox or send a fresh external test message |
| Send reply fails | No active outbound Gmail connection or Gmail API error | Reconnect Gmail or inspect provider response |

## Email Import And Send

Manual import:

```text
POST /api/email/gmail/sync
```

Manual import returns `scanned`, `imported`, `skipped`, `errors`, `skipReasons`, and `errorReasons`. The Gmail importer searches recent mail matching `newer_than:30d {in:inbox to:me}` so a self-test addressed to the connected mailbox is eligible even when Gmail labeling differs from ordinary inbound mail.

If `scanned = 0`, the UI must show: "No recent eligible Gmail messages found. Send a test email to this mailbox, wait a few seconds, then import again."

If `scanned > 0` and `imported = 0`, the UI must show: "Messages were found but skipped, likely because they were already imported."

Imported Gmail messages must flow through inbound processing so contacts, companies, conversations, messages, SLA refresh, inbound email events, workflow events, and audit/log evidence stay aligned.

MVP smoke check:

```text
POST /api/system/mvp-smoke-check
```

This admin-only endpoint does not send customer email. Use the returned `requestId` to correlate server logs with Gmail import logs.

Smoke-check item meanings:

- Active Gmail OAuth connection: pass means the workspace has an active or connected Gmail OAuth `email_connections` row; fail means the user must connect Gmail again.
- Latest Gmail import attempted: pass means `last_inbound_sync_at`, `last_sync_at`, or a stored import summary exists; fail means an admin must run Import latest email.
- Latest import summary available: pass means `provider_metadata.last_import_result` contains the safe count-only summary from the latest import; fail means the import route should be run again so operators can inspect scanned/imported/skipped/errors.
- Gmail-imported conversation visible through Inbox loader: pass means at least one inbound Gmail message maps to a conversation returned by the Inbox loader; fail means imports are not visible to the user and the inbox read path needs investigation.
- OpenAI configured: pass means `OPENAI_API_KEY` exists for AI draft generation; fail means AI drafts cannot run.
- Gmail outbound available: pass means the active Gmail OAuth connection has outbound enabled and server-side token material exists; fail means approved replies cannot be sent through Gmail.

Live watch:

```text
POST /api/email/gmail/watch
POST /api/email/gmail/push
```

Reply send:

```text
POST /api/conversations/[conversationId]/reply
```

Send requires:

- Authenticated user.
- `conversations.reply`.
- Active Gmail OAuth outbound connection.
- Valid conversation in the user's org.

Simulated sends are not acceptable for the MVP path.

## AI Draft Troubleshooting

Check:

- User has `ai.generate`.
- Conversation belongs to org.
- Prompt version is non-null.
- OpenAI provider env is configured.
- Circuit breaker state.
- Knowledge retrieval is not failing.

Expected evidence:

- `ai_drafts` row.
- Prompt version.
- Audit/workflow event where applicable.
- Edit analysis after final reply is sent.

## Queue And SLA Troubleshooting

If queue health looks stale:

1. Confirm inbound messages are being created.
2. Confirm SLA refresh runs after inbound.
3. Inspect conversation SLA fields.
4. Confirm status values are current enum values.
5. Check queue filters for risk, assignee, status, channel, intent, and SLA.

## Workflow Troubleshooting

If automation did not run:

1. Confirm `workflow_events` row exists.
2. Confirm rule is enabled and org-scoped.
3. Confirm event type matches.
4. Inspect `workflow_rule_executions`.
5. Inspect `workflow_action_executions`.
6. Check action allowlist and max action cap.

Workflow execution is operational evidence, not the compliance audit log.

## Security Event Handling

Escalate immediately for:

- Suspected cross-org data exposure.
- Secret exposure.
- Unauthorized privileged action.
- Unexpected service-role write path.
- Repeated auth or webhook failures.
- Audit log tampering concern.

Immediate containment examples:

- Disable affected route or feature flag.
- Rotate exposed secret.
- Revoke affected user/session.
- Disable integration connection.
- Roll back deployment.

## Postmortem Template

```text
Incident:
Severity:
Start:
End:
Owner:
Customer impact:
Root cause:
Detection:
Containment:
Resolution:
Evidence:
What worked:
What failed:
Corrective actions:
Owners and due dates:
```

## Recurring Operations

| Cadence | Check |
|---|---|
| Daily | Production errors, failed Gmail sync/send, auth failures |
| Weekly | Audit anomalies, rate-limit events, failed background jobs, queue/SLA anomalies |
| Monthly | Access review, vendor review exceptions, open incident actions |
| Quarterly | Incident tabletop, RLS sample, recovery review |

Last updated: April 2026
