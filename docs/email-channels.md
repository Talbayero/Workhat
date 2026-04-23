# Email Channels

Work Hat presents mailbox setup as four buyer-friendly connection types:

- OAuth / xOAuth: Gmail today; Outlook / Microsoft 365 maps to the same category as its adapter is enabled.
- Mailbox login and password: direct mailbox authentication where a provider still permits it.
- App password: Gmail with 2FA, Outlook, iCloud, and similar provider-issued app-password flows.
- IMAP / SMTP: custom corporate mailboxes, hosted providers, cPanel, Zoho, and private servers.

Advanced/developer setup also supports custom inbound webhook/API channels for internal relays, SMTP parsing services, and future Postmark-style inbound providers. Outbound replies still use Gmail in this phase. Custom inbound is inbound-only so dogfooding and demos can ingest real operational messages without Google Workspace.

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

## Mailbox Setup UX

Onboarding Step 2 and Settings -> Channels start with the four mailbox connection choices above. The intent is that a prospect immediately sees:

- I can connect Gmail.
- I can connect Outlook / Microsoft 365.
- I can connect my company mailbox with app-password or IMAP/SMTP settings.

Credential-based methods are normalized into `email_connections` with encrypted secrets and non-secret connection metadata. They require `EMAIL_TOKEN_ENCRYPTION_KEY` because Work Hat must decrypt mailbox credentials later when the relevant mailbox adapter runs. Custom inbound webhook token storage does not require this key because webhook tokens are stored as one-way hashes in `channels.config_json`.

`email_connections` separates the two concepts that the UI exposes:

- `connection_type`: `oauth`, `mailbox_password`, `app_password`, `imap_smtp`, or `custom_inbound`.
- `provider`: `gmail`, `microsoft365`, `outlook`, `exchange`, `zoho`, `icloud`, `custom`, or `custom_inbound`.

For example, a Zoho IMAP/SMTP setup is stored as `connection_type = 'imap_smtp'` and `provider = 'zoho'`, not as provider `imap_smtp`.

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

- Settings -> Channels for last success/error status.
- `inbound_email_events` for recent delivery status and error messages.
- `messages.channel_message_id` for provider message ids.
- `workflow_events` for `conversation.created`, `conversation.updated`, `message.received`, and `risk.changed`.
- Conversation SLA snapshot fields for queue health updates after inbound delivery.

## Manual Demo Verification

1. Apply migrations through `0038_email_connection_type_provider_split.sql`.
2. Sign in as an admin or manager with `integrations.manage`.
3. Open onboarding Step 2 or Settings -> Channels and confirm the four mailbox connection types appear first.
4. Connect Gmail through OAuth, or save a credential-based setup record when `EMAIL_TOKEN_ENCRYPTION_KEY` is configured.
5. Open Advanced developer setup and create a custom inbound channel when testing webhook ingestion.
6. Copy the endpoint and token before leaving the page.
7. Send a test request with a unique `externalMessageId`.
8. Confirm the conversation appears in Inbox and Queue.
9. Confirm the sender contact was created and company was associated for a business domain.
10. Confirm SLA status populated on the conversation.
11. Confirm workflow events exist for the delivery.
12. Repeat the same request and confirm no duplicate message appears.

## Backward Compatibility

Gmail support remains active. Gmail import now calls the shared inbound processor after fetching and normalizing Gmail payloads. The custom inbound API endpoint, token model, and normalized payload contract remain backward-compatible; they are now presented as advanced setup instead of the primary buyer path.

`POSTMARK_INBOUND_TOKEN` remains a legacy fallback only for channels without per-channel tokens. New custom inbound channels should use Settings-generated tokens.

*Last updated: April 2026*
