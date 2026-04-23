# Email Channels

Work Hat supports two inbound email paths:

- Gmail: OAuth, Pub/Sub push, and Gmail API import.
- Custom inbound: provider-neutral webhook for internal relays, SMTP parsing services, and future Postmark-style inbound providers.

Outbound replies still use Gmail in this phase. Custom inbound is inbound-only so dogfooding and demos can ingest real operational messages without Google Workspace.

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

## Custom Inbound Setup

Settings -> Channels includes a non-Gmail webhook channel card. Users with `integrations.manage` can:

- Create a custom inbound channel.
- Set a channel name and reply identity metadata.
- Copy the webhook endpoint.
- Copy or regenerate the shared token.
- View status, last successful inbound event, last event status, and last error.

The onboarding flow also offers custom inbound as the recommended Step 2 path for internal dogfooding and demos. Gmail remains available as an optional connected mailbox when a team wants OAuth-based import and Gmail-backed sending, but onboarding should not imply Google Workspace is required before Work Hat can receive operational messages.

Custom inbound token storage requires `EMAIL_TOKEN_ENCRYPTION_KEY` in the deployed environment. Use a high-entropy value such as `openssl rand -base64 32`. Without this key, channel creation fails before Work Hat can persist the webhook secret.

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

1. Apply migration `0036_custom_inbound_email.sql`.
2. Confirm `EMAIL_TOKEN_ENCRYPTION_KEY` is set in the deployed app environment.
3. Sign in as an admin or manager with `integrations.manage`.
4. Open onboarding Step 2 or Settings -> Channels and create a custom inbound channel.
5. Copy the endpoint and token.
6. Send a test request with a unique `externalMessageId`.
7. Confirm the conversation appears in Inbox and Queue.
8. Confirm the sender contact was created and company was associated for a business domain.
9. Confirm SLA status populated on the conversation.
10. Confirm workflow events exist for the delivery.
11. Repeat the same request and confirm no duplicate message appears.

## Backward Compatibility

Gmail support remains active. Gmail import now calls the shared inbound processor after fetching and normalizing Gmail payloads.

`POSTMARK_INBOUND_TOKEN` remains a legacy fallback only for channels without encrypted per-channel secrets. New custom inbound channels should use Settings-generated secrets.

*Last updated: April 2026*
