`src/lib/email` contains backend-only mailbox and email integration logic.

Rules:
- Gmail OAuth remains the MVP self-serve path.
- Keep token exchange, encryption, sync, inbound processing, and mailbox adapters here.
- Route handlers in `app/api` should orchestrate and validate; provider logic belongs here.
- Never expose OAuth secrets, refresh tokens, or encrypted credentials to the client.
