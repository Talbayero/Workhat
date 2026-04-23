# Email Channels

Work Hat presents mailbox setup as four buyer-friendly connection types:

- OAuth / xOAuth: Gmail today; Outlook / Microsoft 365 maps to the same category as its adapter is enabled.
- Mailbox login and password: direct mailbox authentication where a provider still permits it.
- App password: Gmail with 2FA, Outlook, iCloud, and similar provider-issued app-password flows.
- IMAP / SMTP: custom corporate mailboxes, hosted providers, cPanel, Zoho, and private servers.

Advanced/developer setup also supports custom inbound webhook/API channels for internal relays, SMTP parsing services, and future Postmark-style inbound providers. The four mailbox choices are live runtime paths, not saved placeholders: Gmail OAuth uses the Gmail adapter, and mailbox password, app password, and IMAP/SMTP use the IMAP/SMTP adapter for inbound polling and approved outbound replies.

## Architecture

Provider-specific adapters normalize email into `NormalizedInboundEmail` in `web/src/lib/email-connector/inbound.ts`. After normalization, all providers use the same deterministic processing path:

1. Resolve org/channel by `channelId` or configured recipient address.
2. Verify the channel shared secret.
3. Insert `inbound_email_events` for delivery tracking and idempotency.
4. Match or create the contact by sender email.
5. Associate a company for non-generic sender domains.
6. Thread into an existing conversation by external thread id, `In-Reply-To`, or `References`; otherwise create a new conversation.
7. Insert the inbound message.
8. Refresh SLA state.
9. Emit workflow events exactly once for non-duplicate deliveries.

Runtime mailbox adapters live under `web/src/lib/email-connector/adapters/` and implement a shared interface:

- `validateConnection`
- `activateConnection`
- `fetchInbound`
- `sendOutbound`
- `refreshCredentials`
- `getDiagnostics`

`gmail` is the OAuth adapter. `mailbox_password`, `app_password`, and `imap_smtp` all use the IMAP/SMTP adapter after provider-specific host, port, TLS, and app-password guidance has been normalized.

## Mailbox Setup UX

Onboarding Step 2 and Settings -> Channels start with the four mailbox connection choices above. The intent is that a prospect immediately sees:

- I can connect Gmail.
- I can connect Outlook / Microsoft 365.
- I can connect my company mailbox with app-password or IMAP/SMTP settings.

Credential-based methods are normalized into `email_connections` with encrypted secrets and non-secret connection metadata. They require `EMAIL_TOKEN_ENCRYPTION_KEY` because Work Hat decrypts mailbox credentials during validation, polling, and SMTP send. Custom inbound webhook token storage does not require this key because webhook tokens are stored as one-way hashes in `channels.config_json`.

`email_connections` separates the two concepts that the UI exposes:

- `connection_type`: `oauth`, `mailbox_password`, `app_password`, `imap_smtp`, or `custom_inbound`.
- `provider`: `gmail`, `microsoft365`, `outlook`, `exchange`, `zoho`, `icloud`, `custom`, or `custom_inbound`.

For example, a Zoho IMAP/SMTP setup is stored as `connection_type = 'imap_smtp'` and `provider = 'zoho'`, not as provider `imap_smtp`.

## Mailbox Status Model

Saving a mailbox record is not enough for readiness. A connection moves through explicit states:

- `configured`: saved but not yet validated.
- `validating`: validation is in progress.
- `active`: credentials and transport were validated; the mailbox can be used for enabled inbound/outbound paths.
- `error`: validation, sync, or send failed; diagnostics contain the operator-facing reason.
- `disconnected`: intentionally disabled.

Onboarding, Settings, and inbox readiness use `status = 'active'` plus `inbound_enabled` or `outbound_enabled`, depending on the operation. Legacy Gmail rows with `status = 'connected'` are accepted by application code during migration, but migration `0039_mailbox_adapter_runtime.sql` backfills them to `active`.

Runtime fields on `email_connections`:

- `inbound_enabled`, `outbound_enabled`
- `last_validated_at`
- `last_inbound_sync_at`
- `last_outbound_send_at`
- `last_error_code`, `last_error_message`
- `diagnostics_json`
- `credential_metadata`

The IMAP adapter stores its UID cursor in `provider_metadata.imap_state.last_uid`. First sync imports a small recent window, then subsequent syncs fetch messages after the stored UID.

## Custom Inbound Setup

Settings -> Channels and onboarding keep custom inbound under Advanced developer setup. Users with `integrations.manage` can:

- Create a custom inbound channel.
- Set a channel name and reply identity metadata.
- Copy the webhook endpoint.
- Copy the shared token after creation or regeneration.
- View status, last successful inbound event, last event status, and last error.

Custom inbound token storage does not require `EMAIL_TOKEN_ENCRYPTION_KEY`. Work Hat stores a one-way hash of the generated webhook token, so the full token is shown only immediately after creation or regeneration. Gmail OAuth and saved mailbox/app-password/IMAP credentials require `EMAIL_TOKEN_ENCRYPTION_KEY` because those secrets must be decrypted later for provider API or mailbox calls.

The endpoint format is:

```text
POST https://<app-host>/api/inbound/email?channelId=<channel_id>
```

Authentication can use any of:

```text
Authorization: Bearer <channel-token>
X-WorkHat-Inbound-Token: <channel-token>
X-Inbound-Token: <channel-token>
```

## Payload Contract

The generic JSON payload supports these fields:

```json
{
  "provider": "internal_relay",
  "externalMessageId": "provider-message-id",
  "externalThreadId": "provider-thread-id",
  "from": { "email": "customer@example.com", "name": "Customer Name" },
  "to": [{ "email": "support@workhat.example", "name": "Support" }],
  "cc": [],
  "subject": "Need help",
  "textBody": "Plain-text body",
  "htmlBody": "<p>HTML body</p>",
  "receivedAt": "2026-04-22T12:00:00.000Z",
  "headers": {
    "message-id": "<message@example.com>",
    "in-reply-to": "<prior@example.com>",
    "references": "<prior@example.com>"
  },
  "metadata": {
    "relay": "internal"
  }
}
```

Postmark-style field names such as `MessageID`, `FromFull`, `ToFull`, `Subject`, `TextBody`, `HtmlBody`, `Headers`, and `InReplyTo` are accepted for compatibility.

Required fields:

- Message id (`externalMessageId`, `messageId`, `MessageID`, or `headers.message-id`)
- Valid sender email
- At least one valid recipient
- Text or HTML body

## Idempotency

Replay protection uses two layers:

- `inbound_email_events.dedupe_key`: `<channel_id>:<provider>:<external_message_id>`
- `messages.channel_message_id`: `<provider>:<external_message_id>`

Duplicate webhook deliveries return a duplicate result and do not emit workflow events, refresh SLA, or insert another message.

## Diagnostics

Operators should check:

- Settings -> Channels for mailbox status, last validation, last poll, last sync/send, and next-action diagnostics.
- `GET /api/email/mailbox/diagnostics` for adapter/env/connection health.
- `POST /api/email/mailbox/sync` for a manual active mailbox poll.
- `GET /api/email/mailbox/poll` from a scheduler with `Authorization: Bearer <CRON_SECRET>` for recurring IMAP polling.
- `inbound_email_events` for recent delivery status and error messages.
- `messages.channel_message_id` for provider message ids.
- `workflow_events` for `conversation.created`, `conversation.updated`, `message.received`, and `risk.changed`.
- Conversation SLA snapshot fields for queue health updates after inbound delivery.

## Manual Demo Verification

1. Apply migrations through `0039_mailbox_adapter_runtime.sql`.
2. Sign in as an admin or manager with `integrations.manage`.
3. Open onboarding Step 2 or Settings -> Channels and confirm the four mailbox connection types appear first.
4. Set `EMAIL_TOKEN_ENCRYPTION_KEY` before using Gmail OAuth or credential-based mailbox setup.
5. Connect Gmail through OAuth, or configure an app-password/IMAP mailbox such as Zoho.
6. Confirm the saved connection becomes `active`; if it becomes `error`, use the displayed provider/auth/TLS diagnostic to correct the setup.
7. Send a real email to the mailbox and run Settings -> Channels sync or the scheduler-backed `/api/email/mailbox/poll`.
8. Confirm the conversation appears in Inbox and Queue.
9. Send an approved reply from the thread and confirm `sent_replies`, outbound `messages`, and `last_outbound_send_at` are updated.
10. Open Advanced developer setup and create a custom inbound channel when testing webhook ingestion.
11. Copy the endpoint and token before leaving the page.
12. Send a test webhook request with a unique `externalMessageId`.
13. Confirm the sender contact was created and company was associated for a business domain.
14. Confirm SLA status populated on the conversation.
15. Confirm workflow events exist for the delivery.
16. Repeat the same webhook request and confirm no duplicate message appears.

## Backward Compatibility

Gmail support remains active. Gmail import now calls the shared inbound processor after fetching and normalizing Gmail payloads, and Gmail outbound remains available through the Gmail adapter. Credential-based mailbox connections use the IMAP/SMTP adapter for live inbound polling and approved outbound replies. The custom inbound API endpoint, token model, and normalized payload contract remain backward-compatible; they are now presented as advanced setup instead of the primary buyer path.

`POSTMARK_INBOUND_TOKEN` remains a legacy fallback only for channels without per-channel tokens. New custom inbound channels should use Settings-generated tokens.

*Last updated: April 2026*
