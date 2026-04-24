`src/lib/notifications` contains server-only operational notification runtime code.

What belongs here:
- Notification send helpers for internal operational emails
- Shared notification HTML/template helpers
- Conversation assignment and QA notification orchestration

Current Work Hat notification behavior:
- Conversation assignment emails are triggered when a conversation owner assignment changes
- QA follow-up emails are triggered when a workflow-created QA follow-up is assigned to a reviewer user

Subject format:
- Conversation assignment: `Company - Conversation assigned` or `Company - Conversation Subject`
- QA follow-up: `Company - QA follow-up` or `Company - QA follow-up: Conversation Subject`

Conversation links:
- Notification links must use the canonical app base URL from server env/config
- Do not hardcode production URLs inline in templates
- Do not hardcode localhost in production flows

What not to duplicate:
- Resend/system email transport setup
- HTML escaping helpers
- Conversation and QA email templates in routes or components
- Ad hoc URL building scattered across unrelated files
- Task portal language unless Work Hat introduces a real first-class task module
