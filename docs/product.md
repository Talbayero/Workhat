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
| Channels | Gmail OAuth self-serve setup for the MVP, with admin diagnostics and cleanup for legacy/non-MVP connection records |
| Audit / Security | Audit logs, capabilities, rate limiting, and incident evidence |

## Current Product Shape

The current platform includes:

- Authenticated org-scoped CRM workspace.
- Self-serve account creation, password login, forgot-password/reset flow, and post-signup organization creation or invite activation.
- Work Hat user identity is separate from the managed mailbox identity. A user can sign in as `owner@example.com` and connect `support@example.com` as the mailbox Work Hat reads and replies from.
- Email conversations from Gmail OAuth. Gmail OAuth performs token persistence, active mailbox status, initial recent-message import, and optional Pub/Sub watch setup as part of the connection flow.
- Onboarding and Settings present Gmail OAuth as the only self-serve MVP mailbox path. IMAP/SMTP, app password, mailbox password, and custom inbound are not shown as primary setup options.
- A workspace is not marked ready until an active Gmail OAuth connection exists. Legacy forwarding addresses, saved credential records, and manual test conversations do not complete onboarding.
- Approved outbound replies use the active Gmail OAuth mailbox while human approval remains mandatory.
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
- Normal users should never see raw environment-variable, database, or provider-stack errors. Admin-only setup health surfaces missing Google OAuth, encryption, Redis, and adapter prerequisites.
