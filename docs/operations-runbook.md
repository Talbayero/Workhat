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
| Send reply fails | No active outbound Gmail connection or Gmail API error | Reconnect Gmail or inspect provider response |

## Email Import And Send

Manual import:

```text
POST /api/email/gmail/sync
```

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
