# Work Hat CRM V1 PRD

## Document Status

- Status: Draft V1
- Last Updated: 2026-04-03
- Product: Work Hat CRM
- Working Positioning: AI-first operations CRM for support and BPO teams

## Executive Summary

Work Hat CRM is not a general-purpose CRM. V1 is a conversation-centered support operations product that helps teams manage customer conversations, generate AI-assisted replies, and learn from agent edits so response quality improves over time.

The product's wedge is not "AI inside a CRM." The wedge is an AI-operated workflow where:

- conversations are the center of work
- AI provides drafts, risk signals, and reasoning
- humans supervise, edit, and approve
- the system learns from the gap between AI output and agent changes

The initial market is support-heavy SMBs led by founders or operators who want AI assistance but are not ready to fully automate customer communication.

## Problem Statement

Support teams today juggle fragmented inboxes, weak customer context, inconsistent response quality, and low visibility into whether AI is actually helping. Existing CRMs are broad, bloated, and optimized around records and pipelines rather than day-to-day support operations.

Teams need one operating surface where they can:

- manage inbound customer conversations
- see the customer and account context next to the thread
- generate AI-assisted responses grounded in rules and knowledge
- understand when AI is risky or missing context
- learn from every human edit instead of treating AI as a black box

## Product Vision

Work Hat CRM should become the operating system for support teams that want to use AI safely and measurably. In V1, the goal is not full automation. The goal is supervised AI assistance with a built-in feedback loop.

All outbound customer communication in V1 is human-approved before send.

## Positioning

Primary positioning:

> AI-first CRM for support and operations teams

Sharper positioning for go-to-market:

> AI-operated CRM for support teams that improves response quality through agent feedback

Operational pitch:

> Manage conversations, generate AI-assisted replies, and turn every agent edit into insight.

Buyer-oriented pitch for the first market:

> Give your support team one inbox, AI-assisted replies, and a feedback loop that shows where AI is helping, where it is risky, and how quality improves over time.

Proof-oriented pitch:

> Work Hat CRM helps teams measure and improve AI reply quality over time, not just generate drafts.

## Target Customers

### Ideal First Customer Profile

- founder-led or operator-led SMBs
- customer support and CX teams inside SMBs
- SMBs with 5 to 50 support users
- organizations handling moderate email volume
- teams interested in AI assistance but uncomfortable with autonomous AI agents
- buyers who want fast setup and visible ROI without a long implementation cycle

### Why This Segment

- support work is repetitive and measurable
- response quality has clear business impact
- the ROI story is easier to prove
- founders and operators can often buy faster than layered enterprise teams
- narrower workflows make the first version easier to implement and sell

## Product Goals

### Business Goals

- land initial paying design partners quickly
- prove measurable AI value in real support workflows
- create a differentiated product category rather than competing as a generic CRM
- keep setup lightweight enough for an operator-led team to adopt without services-heavy onboarding

### User Goals

- reduce time spent writing replies
- improve consistency, clarity, and compliance
- centralize support conversations and customer context
- help managers understand when AI is helping or hurting

### Primary ROI Thesis

The first ROI claim this product should be designed to prove is measurable AI improvement over time.

That means V1 should help customers answer:

- is AI getting more usable over time?
- where is AI failing most often?
- which edits should inform prompt, policy, or knowledge improvements?
- is the team becoming more effective because the AI loop is improving?

### Product Goals for V1

- deliver a usable inbox for support teams
- enable AI-generated draft replies with context and risk indicators
- track how agents change AI drafts
- convert those edits into actionable QA and coaching insights
- stay architecturally clean enough to support future enterprise requirements without building for them fully in V1
- make AI performance improvement legible enough to become the product's clearest ROI story

## Non-Goals

The following are explicitly out of scope for V1:

- full sales CRM and pipeline management
- telephony
- social media channels
- marketplace and broad integrations platform
- workflow automation builder
- advanced campaign management
- mobile app
- advanced SLA engine
- complex custom reporting
- white-label multi-brand support
- full enterprise deployment flexibility on day one

## Product Principles

- Conversation-first, not pipeline-first
- AI must be measurable, not magical
- Human review remains central in V1
- Start narrow and sellable, not broad and impressive
- Use deterministic logic before LLM reasoning when possible
- External pricing should feel simple even if internal usage is complex
- No autonomous outbound sending in V1

## Core Users and Roles

### Admin

Can:

- manage org settings
- invite and manage users
- assign roles
- connect channels
- configure AI rules and knowledge
- access billing and analytics

### Manager

Can:

- view conversations
- monitor performance
- review AI insights
- access dashboards
- review quality patterns

### Agent

Can:

- work conversations in the inbox
- open customer records
- generate AI drafts
- edit and send responses
- add tags and internal notes

### QA Reviewer

Can:

- review AI draft versus final response
- categorize edit reasons
- score or annotate quality
- identify coaching opportunities

## V1 Scope

### In Scope

- authentication and organization setup
- basic user roles
- customer and company records
- unified inbox
- email channel at launch
- SMS designed into the architecture but released after launch
- conversation thread view
- AI reply generation
- AI confidence and risk indicators
- agent edit tracking
- AI versus final compare view
- manager and QA insights dashboard
- lightweight knowledge and tone configuration
- billing foundation and AI usage tracking
- human approval required before any outbound send

### Recommended Cut for True MVP

If speed becomes a concern, the strictest MVP cut should be:

- email only at launch
- inbox
- conversation detail
- AI draft generation
- draft editing and sending
- edit analysis
- minimal manager dashboard

## Core Modules

## 1. Unified Inbox

The inbox is the center of daily work.

### Core Capabilities

- receive inbound customer conversations
- display threaded message history
- show customer and account context beside the thread
- assign owners
- add tags and internal notes
- mark conversations open or closed

### Inbox Views

- all conversations
- mine
- unassigned
- awaiting response
- closed
- high risk
- AI needs review

### Conversation Detail View

The conversation workspace should include:

- full message thread
- reply composer
- AI action panel
- customer profile sidebar

AI-generated responses must enter the composer as editable drafts, not send automatically.
- tags, notes, and recent history

## 2. AI Copilot

This is the main product differentiator, but it should stay focused.

### Core Functions

- summarize the thread
- suggest a reply
- explain rationale
- highlight missing context
- flag risk or policy concerns
- suggest next best action
- recommend tags or categories

### Operating Constraint

- AI can draft, summarize, explain, and classify
- AI cannot send customer-facing replies automatically in V1

### Inputs

- recent thread messages
- customer profile
- account context
- org tone and brand rules
- knowledge snippets
- explicit response rules

### Outputs

- suggested reply
- rationale summary
- confidence label
- risk flags
- missing context indicators
- recommended tags

### Confidence Model

- Green: enough context and low ambiguity
- Yellow: partial context or some uncertainty
- Red: high uncertainty or elevated risk

This confidence should be treated as an operational signal, not proof of correctness.

## 3. Agent Edit Analyzer

This is the likely wedge feature for V1.

### Workflow

1. AI generates a draft
2. Agent edits the draft
3. Agent sends the final response
4. System compares draft versus final reply
5. System classifies what changed and likely why

### Initial Change Categories

- tone adjustment
- clarity rewrite
- factual correction
- missing information
- policy or compliance fix
- personalization
- empathy improvement
- formatting or grammar
- action or instruction correction

### Outputs

Per reply:

- similarity or edit distance score
- change percentage
- detected categories
- likely reason summary
- confidence in classification
- flag for manager review when necessary

At aggregate level:

- most common edit reasons
- top failing conversation types
- agents with high edit rates
- knowledge or prompt gaps

### Design Constraint

The system should not overclaim causality. It should report detected changes and likely reasons with confidence rather than pretending to know the true motive behind an edit.

## 4. AI QA and Insights Dashboard

The dashboard turns the workflow into management value.

### Manager Metrics

- total conversations
- first response time
- average resolution time
- AI assist rate
- AI acceptance rate
- average edit rate
- top change reasons
- high-risk conversations
- top failing intents or categories
- AI quality trend over time
- prompt and knowledge improvement opportunities

### Founder / Operator Metrics

- inbox volume and backlog
- first response time trend
- AI adoption rate
- AI draft acceptance and edit rate
- top quality failure reasons
- visible handling efficiency improvement over time
- measurable AI improvement trend over time

### Agent Metrics

- conversations handled
- AI usage rate
- average edit distance
- response time
- coaching flags

Agent-facing insight in V1 should be lightweight and optional rather than inserted into every response workflow.

### QA Metrics

- reviewed conversations
- pass or fail rate if enabled
- common AI issue categories
- common policy failures
- top context gaps

## 5. Context Engine

This should remain intentionally lightweight in V1.

### Supported Inputs

- SOP snippets
- FAQ entries
- plain-text rules
- uploaded files
- writing guidelines
- mandatory phrasing
- forbidden phrasing

### Retrieval Approach

- start with simple retrieval
- fetch only the most relevant snippets
- pass concise context into the model

Do not build a complex knowledge platform in V1.

### V1 Knowledge Constraint

- support both file uploads and structured text entries
- extract uploaded content into concise retrievable chunks
- avoid advanced knowledge workflows such as approvals, branching, or rich document editing

## User Experience Requirements

## UX Goals

- fast triage from the inbox
- clear context and ownership in the conversation view
- AI support that feels transparent rather than mysterious
- easy comparison between AI draft and final response
- low training burden for new agents
- setup and configuration simple enough for a hands-on operator to complete quickly

## UX Principles

- the conversation detail screen is the primary workspace
- AI explanations should be short and operational
- risk should be visible at a glance
- confidence should help prioritize human review
- the UI should reduce cognitive load, not add control-panel clutter

## Initial Screen Set

### 1. Login and Signup

Purpose:

- authentication
- organization creation
- initial onboarding

### 2. Inbox List

Purpose:

- central operating table for support work

Key elements:

- filters by status, assignee, channel, tag, risk, and date
- sortable conversation list
- fast navigation into thread details

### 3. Conversation Detail

Purpose:

- primary work surface for agents

Key elements:

- message thread
- composer
- AI draft actions
- AI analysis panel
- customer sidebar
- notes and tags

### 4. Contact Profile

Purpose:

- quick customer context

Key elements:

- identity
- communication channels
- notes
- related conversations
- company relationship

### 5. AI Compare View

Purpose:

- compare AI draft and final response

Key elements:

- side-by-side or inline diff
- change highlights
- categories
- likely root cause
- reviewer notes

Default behavior:

- managers and QA can use this as a regular review surface
- agents can open it on demand
- agents do not see it forced after every send in V1

### 6. Dashboard

Purpose:

- make AI and team performance legible

### 7. Settings and Knowledge

Purpose:

- manage users, channels, AI rules, tone, knowledge, and billing

## Functional Requirements

## Authentication and Org Setup

- users can sign up and log in
- users belong to an organization
- admins can invite users
- roles must control access to features

## Contact and Company Records

- inbound messages auto-match to existing contacts by email or phone
- if no match exists, the system creates a new contact automatically
- contacts can be associated with companies
- contacts and companies can have notes and tags

## Conversation Management

- conversations support open and closed states
- conversations can be assigned to a user
- conversations can be filtered and searched
- messages support inbound, outbound, internal, and AI-generated states
- agents can open draft-versus-final comparison on demand without interrupting the default reply flow

## AI Assistance

- agent can request AI draft from the conversation screen
- system stores AI draft, rationale, confidence, and risk flags
- agent can edit before sending
- system stores final reply and links it to the AI draft when applicable
- system must enforce human approval before any outbound customer message is sent

## Edit Analysis

- system computes a deterministic diff between AI draft and final reply
- system uses AI to classify change types after diffing
- analysis is stored in structured form for reporting

## Knowledge and Rules

- admins can create and manage knowledge entries
- admins can upload source files for knowledge ingestion
- entries can be scoped by tags or channel if needed
- inactive entries should not be retrieved for generation
- uploaded content should be normalized into retrievable text instead of treated as a raw attachment at generation time

## Billing and Usage

- system tracks seat count
- system tracks AI usage events
- plans must distinguish between CRM subscription and AI usage

## Technical Direction

## Recommended Stack

- Frontend: Next.js, TypeScript, Tailwind CSS, shadcn/ui
- Backend: Supabase
- Database: Postgres via Supabase
- Auth: Supabase Auth
- Storage: Supabase Storage
- AI: OpenAI first with a provider abstraction layer
- Email: Resend, Postmark, or Gmail integration path
- SMS: Twilio-ready abstraction designed in V1, activated in the post-launch phase
- Billing: Stripe
- Observability: Sentry and product analytics

## Architecture Constraints

- do not over-engineer the first version
- use route handlers or a lean API layer
- store enough AI metadata to support debugging and analytics
- keep prompting modular rather than building one giant prompt
- prefer deterministic logic before LLM logic when possible
- keep file ingestion reliable and narrow rather than building a full document-management system
- build as multi-tenant SaaS first with clean org-level data boundaries
- preserve room for future enterprise needs such as auditability, SSO, and stricter data controls

## Data Model

Core entities:

- organizations
- users
- contacts
- companies
- channels
- conversations
- messages
- ai_drafts
- sent_replies
- edit_analyses
- knowledge_entries
- qa_reviews
- tags
- usage_events
- billing_subscriptions

Tenant isolation should be enforced consistently at the organization level across user, conversation, AI, and usage data.

## Suggested API Surfaces

### Auth and Org

- `POST /api/org/create`
- `POST /api/invite`
- `GET /api/me`

### Contacts

- `GET /api/contacts`
- `POST /api/contacts`
- `GET /api/contacts/:id`
- `PATCH /api/contacts/:id`

### Conversations

- `GET /api/conversations`
- `GET /api/conversations/:id`
- `PATCH /api/conversations/:id`
- `POST /api/conversations/:id/assign`
- `POST /api/conversations/:id/tag`

### Messages

- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/reply`
- `POST /api/inbound/email/webhook`
- `POST /api/inbound/sms/webhook`

### AI

- `POST /api/ai/draft`
- `POST /api/ai/summarize`
- `POST /api/ai/analyze-edit`
- `POST /api/ai/classify-risk`

### Knowledge

- `GET /api/knowledge`
- `POST /api/knowledge`
- `PATCH /api/knowledge/:id`
- `DELETE /api/knowledge/:id`

### Dashboard

- `GET /api/dashboard/manager`
- `GET /api/dashboard/agent`
- `GET /api/dashboard/qa`

### Billing

- `GET /api/billing`
- `POST /api/billing/checkout`
- `POST /api/billing/webhook`

## AI Workflow Blueprint

## Draft Generation Flow

1. Gather recent thread messages
2. Fetch contact and company context
3. Retrieve relevant knowledge snippets
4. Apply org tone and rule settings
5. Generate structured response
6. Store draft output and prompt version

### Draft Output Schema

- `draft_text`
- `confidence_level`
- `risk_flags`
- `missing_context`
- `recommended_tags`
- `rationale`

## Edit Analysis Flow

1. Diff AI draft versus final response
2. Extract deterministic changes
3. Run AI classification over the diff
4. Store structured analysis results

This hybrid approach should be cheaper and more reliable than asking an LLM to infer everything from scratch.

## Pricing Direction

Pricing should remain simple and legible to buyers.

### CRM Subscription

- per-seat pricing
- starter and growth tiers in V1

### AI Usage

- customer-facing pricing should use simple units such as AI actions or AI assists
- internal implementation can remain token-based if needed

### Pricing Constraint for First Buyer

- packaging must be understandable to a founder or operator without procurement support
- plans should emphasize fast time-to-value and predictable cost

## Success Metrics

### Customer-Level

- time to first value after onboarding
- weekly active agent usage
- AI assist adoption rate
- reduction in average reply drafting time
- reduction in repeated quality issues
- improvement in AI draft usability over time

### Product-Level

- AI draft acceptance rate
- average edit percentage
- risk flag precision over time
- knowledge retrieval usefulness
- conversion from trial or pilot to paid
- rate of improvement in AI draft quality by customer over time

## Risks and Mitigations

### Risk: Overbuilding

Mitigation:

- hold scope around the conversation workflow
- defer broad CRM modules

### Risk: Channel Integration Complexity

Mitigation:

- start with email only if necessary
- use the simplest reliable email ingestion path first
- keep channel abstractions clean so SMS can be added immediately after launch

### Risk: AI Accuracy Expectations

Mitigation:

- show confidence and rationale
- keep human approval in the loop
- avoid promising full automation

### Risk: Weak Differentiation

Mitigation:

- lean hard into edit analysis and measurable improvement
- position around AI coaching and response intelligence, not generic CRM breadth

### Risk: Future Enterprise Requirements Cause Rework

Mitigation:

- keep tenancy, permissions, auditability, and provider abstractions clean in V1
- avoid promising enterprise deployment modes before the core product is validated

## Delivery Plan

## Phase 1: Product Skeleton

- project setup
- auth
- orgs and roles
- basic layout shell
- mock inbox

## Phase 2: Real Inbox

- email ingestion
- thread display
- reply sending
- contact auto-creation

## Phase 2.5: Post-Launch Channel Expansion

- add SMS support using the existing channel abstraction
- validate cross-channel contact matching
- extend inbox and reply flows for SMS-specific handling

## Phase 3: AI Copilot

- draft generation
- thread summary
- confidence and risk schema
- draft storage

## Phase 4: Edit Analyzer

- sent reply tracking
- diff engine
- categorized analysis
- compare view

## Phase 5: Dashboard

- core team metrics
- AI performance metrics
- review and coaching views

## Phase 6: Billing

- plan modeling
- usage tracking
- checkout and subscription flows

## Assumptions in This Draft

- V1 is support-first, not sales-first
- email is the launch channel
- SMS is intentionally post-launch, but the architecture should support it cleanly
- human-in-the-loop review is required before sending
- no auto-send workflows are included in V1
- Supabase and Next.js remain the preferred stack
- pricing will separate CRM seats from AI usage
- the product is multi-tenant SaaS first, with selective early attention to future enterprise constraints

## Open Product Questions

The highest-priority product questions from the first interview loop are now resolved.

Primary resolved direction:

- the product is designed first to prove measurable AI improvement

## Interview Notes

This PRD is intentionally opinionated, but it is still a draft. The next step is to tighten the unresolved product decisions through short interviews and revise this document after each answer.

## Immediate Next Recommendation

Lock these four decisions first:

- launch channel scope
- first buyer persona
- human approval policy
- primary ROI metric

Once those are locked, the PRD can be converted into:

- a technical build spec
- a screen-by-screen UI spec
- an implementation plan for the first milestone
