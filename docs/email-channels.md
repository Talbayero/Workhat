# Email Channels

Work Hat's MVP self-serve email path is Gmail OAuth only.

Do not present IMAP/SMTP, app password, mailbox password, or custom inbound as ordinary setup choices until each path is verified end to end. Those adapters may exist in code for future work or compatibility, but they do not count as product readiness.

## Supported MVP Path

1. User creates a Work Hat account.
2. User creates or joins an organization.
3. User connects Gmail through OAuth.
4. Work Hat stores an active `email_connections` row:
   - `provider = 'gmail'`
   - `connection_type = 'oauth'`
   - `status = 'active'`
   - `inbound_enabled = true`
   - `outbound_enabled = true`
5. Work Hat imports recent Gmail messages through the Gmail importer.
6. Imported email becomes conversations and messages in the Inbox.
7. Agents generate, edit, approve, and send replies through Gmail.
8. Audit logs, sent reply records, message records, workflow events, and SLA refreshes record the flow.

## Canonical Google OAuth Routes

Use one redirect URI in Google Cloud:

```text
https://work-hat.com/api/oauth/google/callback
```

The OAuth start route is:

```text
GET /api/oauth/google/start
```

The OAuth callback route is:

```text
GET /api/oauth/google/callback
```

Legacy Gmail routes may redirect to the canonical routes for compatibility, but new setup and diagnostics must use the canonical callback URI above.

## Required Environment Variables

Gmail OAuth is available only when all of these are configured:

- `APP_BASE_URL=https://work-hat.com`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `EMAIL_TOKEN_ENCRYPTION_KEY`

Additional operational variables:

- `SUPABASE_SERVICE_ROLE_KEY` for server-side connection persistence and import.
- `GOOGLE_PUBSUB_TOPIC` and `GMAIL_PUSH_TOKEN` for Gmail watch/Pub/Sub updates.
- `CRON_SECRET` for protected cron endpoints.
- Redis variables for rate limiting when enabled.

Admins can see missing values and the exact redirect URI in Settings -> Channels -> Admin setup health and `/api/system/setup-health`.

## Gmail Scopes

Current OAuth scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`

These support mailbox identity, recent message import, and sending human-approved replies.

## Readiness Rules

A workspace is email-ready only when it has an active Gmail OAuth connection. Legacy forwarding addresses, saved credential records, custom inbound channels, or manually created conversations do not satisfy onboarding readiness.

Readiness checks live in `web/src/lib/email-connector/setup-readiness.ts` and are exposed through:

- `GET /api/email/setup/readiness`
- `GET /api/system/setup-health`

Normal users see user-safe setup messages. Admins see missing environment variables and the exact OAuth redirect URI.

## Disabled Paths

The following paths are disabled from self-serve MVP setup:

- Mailbox login and password
- App password
- IMAP / SMTP
- Custom inbound webhook/API setup
- Demo/test inbox as a substitute for connected email

The backend must not mark any of these as a completed mailbox setup. Settings may show legacy records only for reset/cleanup and diagnostics.

## Import And Send

Manual Gmail import uses:

```text
POST /api/email/gmail/sync
```

Generic mailbox sync/poll routes are constrained to Gmail OAuth records during the MVP:

```text
POST /api/email/mailbox/sync
GET /api/email/mailbox/poll
```

Outbound customer replies use `lib/email-connector/outbound.ts`, which selects only active Gmail OAuth connections during the MVP. If no active Gmail connection exists, `/api/conversations/[conversationId]/reply` returns a visible error instead of simulating a send.

## Manual Verification Checklist

1. Confirm Google Cloud has `https://work-hat.com/api/oauth/google/callback` in Authorized redirect URIs.
2. Confirm Settings -> Channels -> Admin setup health shows Google OAuth configured.
3. Create a new Work Hat account.
4. Create a workspace.
5. Connect Gmail from onboarding.
6. Confirm the callback returns to onboarding/settings with a visible success message.
7. Confirm `email_connections` has an active Gmail OAuth row for the org.
8. Run Gmail import from onboarding or Settings.
9. Confirm a Gmail message appears in Inbox as a conversation.
10. Generate an AI draft.
11. Edit and send an approved reply.
12. Confirm audit logs, outbound message, `sent_replies`, workflow events, and SLA fields were updated.

*Last updated: April 2026*
