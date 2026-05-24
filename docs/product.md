# Product

Work Hat is a conversation-first CRM where AI helps teams handle customer communication faster, more consistently, and with measurable improvement.

It is not just Gmail with AI, not a chatbot, and not a generic CRM. Work Hat sits between customer communication channels and the human team:

```text
Customer message -> structured conversation -> AI draft -> human edit/approval -> send -> analyze edits -> improve
```

## Product Definition

Work Hat is an operations system for managing customer conversations with AI assistance and feedback loops.

The product should feel simple to a user:

> I open Work Hat, see all conversations, click one, get a smart reply, tweak it, send it, and over time the system gets better.

## Core Product Loop

1. Capture conversations from email now, with SMS and chat later.
2. Normalize each message into a structured conversation.
3. Generate an AI reply draft using conversation context and knowledge.
4. Keep humans in control through review, edit, and approval.
5. Send the approved reply through the connected mailbox.
6. Compare AI draft against the human-edited final reply.
7. Use edit patterns to improve prompts, knowledge, QA, and operations.
8. Measure performance with operational metrics.

## Current MVP Path

The only acceptable self-serve MVP path is:

1. User creates a Work Hat account.
2. User logs in.
3. User can reset password.
4. User creates a workspace.
5. User connects Gmail through OAuth.
6. Gmail OAuth uses Work Hat's owned Google OAuth app and stable callback.
7. Connected Gmail creates an active mailbox connection.
8. User imports or syncs latest email.
9. Email appears in Inbox as a conversation.
10. User generates an AI draft.
11. User edits and sends the reply.
12. Audit/logging records the flow.

Do not claim onboarding is complete unless this path works.

## Inbox Experience Standard

The Inbox is the primary Work Hat workspace. A usable conversation must make the current reply target obvious:

- The thread workspace shows an "Active customer message" panel under the conversation header with the latest inbound customer message, sender, subject, timestamp, and message body preview.
- The composer stays focused on writing and approval, without duplicating customer message context.
- A collapsible customer details panel shows identity, email, company, tags, prior conversation count, last activity, and notes when available.
- Customer messages, agent replies, internal notes, and activity/system events use distinct visual treatments.
- Internal notes are team-only and must never look like outbound customer replies.
- The default operational queue prioritizes `human_customer` and `unknown` imported Gmail conversations.
- System notifications, auth emails, and newsletters are retained but shown through an automated/system filter instead of cluttering the default queue.
- If automated/system mail is hidden from the default queue, the Inbox should show a small count so users know those messages still exist.
- The conversation queue is resizable with a quiet splitter, can be collapsed, and should automatically yield space to the thread on narrow or high-zoom layouts.
- AI Draft and Send controls must be disabled with visible reasons when there is no latest inbound customer message, the reply is empty, or the conversation is closed.

## Modules

| Layer | Module | Purpose |
|---|---|---|
| Execution | Inbox / Conversations | Conversation list, thread workspace, replies, internal notes, status, tags, risk, assignment |
| Execution | Queue / SLA | First-response and next-response visibility, overdue detection, queue pressure |
| Execution | Contacts / Companies | CRM context linked to conversations |
| AI | Draft Generation | Human-approved suggested replies with prompt versioning |
| AI | Knowledge | Operator-managed policies, SOPs, tone guides, and product facts |
| AI | Context Engine V1 | Operator-managed operational context objects selected during draft generation |
| Feedback | Edit Analysis | Measures what humans changed from the AI draft |
| Feedback | AI Improvement | Acceptance rate, edit distance, repeated correction patterns, likely knowledge gaps |
| Control | QA | Review layer for quality, risk, and coaching |
| Control | Workflow Engine | Deterministic event/rule actions, not arbitrary automation scripting |
| Control | Prompt Experiments | Controlled prompt-version rollout and rollback |
| Trust | Audit / Security | Auth, authorization, audit logs, rate limits, tenant isolation, retention, privacy |

## Metrics That Matter

Work Hat should optimize for operational outcomes, not vanity metrics:

- Draft acceptance rate.
- Average edit distance.
- Average change percent.
- Full rewrite rate.
- Edit category distribution.
- First-response time.
- Next-response time.
- SLA compliance.
- Queue backlog and aging.
- Knowledge gap frequency.
- Prompt-version performance.

## Current Product Constraints

- Gmail OAuth is the only self-serve email channel for the MVP.
- Customers do not configure Google Cloud, OAuth client credentials, redirect URIs, Vercel environment variables, or provider infrastructure.
- IMAP/SMTP, app password, mailbox password, custom inbound, SMS, and chat are not allowed in the MVP setup path.
- Human approval is mandatory for customer replies.
- AI recommendations must remain explainable and traceable.
- Multi-tenant org isolation is mandatory.
- Security and privacy controls must be evidence-backed for SOC 2, ISO 27001, and ISO 27701 readiness.

## Context Engine V1

Work Hat's first context-engine layer is intentionally lean.

It adds:

- org-scoped context objects
- immutable context versions
- manual context selection during AI draft generation
- exact context object and version provenance stored on `ai_drafts`
- context provenance propagated into `edit_analyses` when a draft becomes a sent reply

It does not add:

- autonomous actions
- a visual workflow builder
- arbitrary rules scripting
- a second knowledge base
- autonomous reply sending

The purpose of Context Engine V1 is to improve the existing loop:

```text
conversation -> AI draft -> human edit -> send -> edit analysis -> improvement
```

Context objects should capture operational guidance and decision framing. Factual SOP content should still live in `knowledge_entries`, which context objects may reference.

## Out Of Scope

- Fully autonomous customer replies.
- Visual workflow builder.
- Arbitrary scripting or user-defined code execution.
- Multi-channel marketplace.
- Complex enterprise BPM.
- Black-box AI recommendations without source evidence.

Last updated: April 2026
