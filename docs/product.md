# Product Overview

Work Hat CRM is an AI-assisted operations CRM for support and customer operations teams. The platform is evolving from a shared inbox into an operations OS: conversations, contacts, companies, knowledge, QA, SLA tracking, workflow automation, and AI improvement all work from the same org-scoped operational record.

This file is the active product summary. Historical source planning documents live in `docs/archive/planning/`.

## Product Principles

1. Human approval remains in the loop for customer replies.
2. Operational state must be explainable: assignment, priority, SLA, risk, QA, and workflow actions need clear records.
3. AI should improve operations through traceable draft, edit, prompt, and knowledge analytics.
4. Automation should be lean and deterministic before it becomes visual or open-ended.
5. Multi-tenant org isolation is a product requirement, not only an implementation detail.

## Core Modules

| Module | Purpose |
|---|---|
| Inbox / Conversations | Agent workspace for customer threads, messages, replies, AI drafts, risk, status, assignment, tags, and intent |
| Contacts / Companies | CRM records tied to conversations and customer context |
| Knowledge | Operator-managed knowledge used by AI drafts and improvement recommendations |
| AI Drafting | Human-approved suggested replies with prompt versioning, confidence, risk flags, and missing context |
| Edit Analysis | Deterministic and LLM-assisted analysis of how humans changed AI drafts |
| QA | Review layer for operational quality and risk follow-up |
| SLA / Queue Health | First-response and next-response SLA tracking, breached/at-risk filters, aging buckets, and backlog pressure |
| Workflow Engine | Event/rules system for deterministic operational actions |
| AI Improvement | Prompt-version analytics, edit pattern clustering, and knowledge gap candidate surfacing |
| Prompt Experiments | Controlled, deterministic prompt-version traffic allocation and rollback |
| Channels | Buyer-friendly mailbox setup for OAuth/xOAuth, mailbox password, app password, and IMAP/SMTP, with custom inbound webhook/API kept as an advanced path |
| Audit / Security | Audit logs, capabilities, rate limiting, and incident evidence |

## Current Product Shape

The current platform includes:

- Authenticated org-scoped CRM workspace.
- Email conversations from Gmail OAuth, mailbox password, app password, IMAP/SMTP, or advanced custom inbound webhook channels. Gmail OAuth now performs token persistence, active mailbox status, initial recent-message import, and optional Pub/Sub watch setup as part of the connection flow.
- Onboarding and Settings present four mailbox connection choices first: OAuth/xOAuth, mailbox login and password, app password, and IMAP/SMTP; successful setup must validate into an active runtime connection before the workspace is treated as inbound-ready.
- Custom inbound webhook/API setup remains available under advanced/developer setup for relays and custom parsers.
- Approved outbound replies use the active mailbox adapter when outbound is enabled, while human approval remains mandatory.
- AI draft generation with non-null prompt versions.
- Capability-based authorization over role presets.
- SLA snapshots and queue health views.
- Workflow events, rules, and auditable execution.
- AI improvement dashboard surfaces.
- Prompt experimentation model with deterministic assignment and service-role assignment writes.
- Security hardening around rate limits, audit logs, validation, and admin client usage.

## Out Of Scope For The Current Phase

- Full visual workflow builder.
- Fully autonomous AI replies.
- Complex BPM-style workflow orchestration.
- Black-box model recommendations without traceable source edits or metrics.
- Enterprise data warehouse integration.
- Browser push/PWA-first experience.

## SOC 2 Product Readiness Notes

Product surfaces should support SOC 2 readiness by making control evidence visible:

- Access decisions should be traceable to role/capability checks.
- Important user and system actions should be captured in audit logs.
- Queue/SLA and workflow automations should be explainable from stored records.
- AI decisions should preserve prompt versions, assignment records, and human edits.
- Operator runbooks should map to the actual UI and API behavior.
