# Work Hat CRM — Product Requirements Document
**Version:** 2.1
**Date:** April 3, 2026
**Author:** Teddy A
**Status:** Draft — Active

---

## Document Map

This PRD is one of three planning documents in this repo. They are not redundant — each has a different job.

| Document | Job | Audience |
|---|---|---|
| `prd.md` (this file) | Product decisions: what we build, why, for whom, and how it should feel | Teddy, future hires, design partners |
| `technical-build-spec.md` | Implementation blueprint: stack, data model, API contracts, module structure, milestones | Codex, engineers, technical review |
| `supabase-schema-migration-plan.md` | Database execution plan: migration phases, enum strategy, indexes, RLS, delete behavior | Codex, database setup |

When there is a conflict between this PRD and the technical spec, the technical spec wins on implementation details. This PRD wins on product decisions, scope, and UX direction.

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [The Core Problem We Are Solving](#2-the-core-problem-we-are-solving)
3. [Positioning](#3-positioning)
4. [Target Customer](#4-target-customer)
5. [Architecture and Layout Redesign](#5-architecture-and-layout-redesign)
6. [Module Definitions](#6-module-definitions)
7. [Core User Flows](#7-core-user-flows)
8. [AI Experience Design](#8-ai-experience-design)
9. [Edit Analyzer — The Killer Feature](#9-edit-analyzer--the-killer-feature)
10. [Design Language](#10-design-language)
11. [Technical Stack](#11-technical-stack)
12. [Database Schema](#12-database-schema)
13. [V1 Scope — What Is In, What Is Out](#13-v1-scope--what-is-in-what-is-out)
14. [Billing Model](#14-billing-model)
15. [Build Phases](#15-build-phases)
16. [Open Decisions](#16-open-decisions)
17. [Rules We Do Not Break](#17-rules-we-do-not-break)

---

## 1. Product Vision

Work Hat CRM is an **AI-first operations CRM for customer support and BPO teams**. It is not a general CRM. It is not a better Bitrix24. It is not a chatbot platform.

It is a product that puts conversations at the center, uses AI as the primary operator layer, and keeps humans in the supervisory seat — reviewing, approving, and improving every AI-generated response.

**V1 pitch sentence:**
> Work Hat helps support teams receive customer conversations, generate AI-assisted replies, and learn from every agent edit — so response quality improves automatically over time.

---

## 2. The Core Problem We Are Solving

### 2a. The Customer's Problem

Support teams handling moderate-to-high email volume face three compounding problems:

**Speed.** Writing responses from scratch is slow and mentally draining at scale.

**Quality.** Response quality varies wildly by agent, mood, experience, and time of day.

**Improvement.** There is no structured feedback loop. Bad responses are sent, forgotten, and repeated.

Current tools (Bitrix24, Zendesk, Freshdesk) address throughput but not intelligence. They are pipelines, not operators.

### 2b. The Builder's Problem (Identified in Design Review)

The current skeleton of Work Hat suffers from one critical architectural flaw:

> **Everything is crammed into one single window. There are no organized modules. The experience is overwhelming and impossible to understand at a glance.**

This document redefines the product around a modular, focused architecture where each area of the product has its own context and purpose — and agents are never asked to process too much information at once.

---

## 3. Positioning

| What We Are NOT | What We ARE |
|---|---|
| A general CRM | An AI-operated CRM for support teams |
| A better Bitrix24 | A conversation-intelligence platform |
| A chatbot / automation tool | An AI copilot with human-in-the-loop |
| A pipeline manager | A response quality engine |

**The one line that matters:**
> We are not "CRM with AI." We are "AI-operated support CRM."

---

## 4. Target Customer

### Ideal Customer Profile (V1)

- **Company type:** SMB with a dedicated support or customer ops function
- **Team size:** 5–20 support agents
- **Volume:** Moderate-to-high email volume (hundreds to low thousands of threads per month)
- **Pain:** Agents write responses manually, quality is inconsistent, no way to improve over time
- **Trust level with AI:** Interested but cautious — they will not let AI send without review

### Why This Segment

Pain is real and immediate. Workflows are repetitive, so AI can add the most value. They understand reply quality and ROI is provable through faster responses and fewer escalations. They will not demand integrations, mobile apps, or enterprise features on day one.

### Who We Are NOT Targeting in V1

Enterprise (200+ seat) support orgs, sales-led CRM buyers, teams that want full AI automation without human review, and companies with complex telephony or multi-channel requirements.

---

## 5. Architecture and Layout Redesign

### Why the Current Approach Fails

The current implementation puts all panels — thread, AI draft, customer profile, notes, tags — visible simultaneously in a single window. This creates cognitive overload for agents trying to focus on the conversation, no clear visual hierarchy, and a UI that looks like a CRM rather than a focused work tool.

### The Solution: Modular, Context-Aware Layout

Work Hat V1 uses a **hybrid navigation model**:

- **Persistent left sidebar** for navigation between modules
- **Focused main panel** that changes based on the active module
- **Contextual slide-in panels** for secondary information (customer profile, AI, notes) — never auto-expanded unless the agent requests them

Agents see what they need, when they need it. Nothing more.

---

### Global Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│  [Logo]  [Org Name]                    [User Avatar]     │  ← Top bar (minimal)
├──────┬───────────────────────────────────────────────────┤
│      │                                                   │
│  S   │         MAIN PANEL (context-dependent)            │
│  I   │                                                   │
│  D   │                                                   │
│  E   │                                                   │
│  B   │                                                   │
│  A   │                                                   │
│  R   │                                                   │
│      │                                                   │
└──────┴───────────────────────────────────────────────────┘
```

### Left Sidebar — Navigation Only

The sidebar is narrow (icon + label) and contains exactly five destinations:

| Icon | Label | Destination |
|---|---|---|
| Inbox | Inbox | Conversation list and active thread |
| Contacts | Contacts | Customer records |
| Companies | Companies | Account and company records |
| Dashboard | Dashboard | Metrics and insights |
| Settings | Settings | Channels, AI config, knowledge, users |

No other items. The sidebar does not contain filters, notifications, or secondary navigation — those live inside each module.

### Inbox Module Layout — Three-Panel Split

When inside the Inbox module, the layout becomes a three-panel view:

```
┌──────┬──────────────────┬──────────────────────────────────┐
│      │                  │                                  │
│ NAV  │  CONVERSATION    │      THREAD VIEW                 │
│      │  LIST            │                                  │
│      │  (filterable)    │  [Message 1 — inbound]           │
│      │                  │  [Message 2 — outbound]          │
│      │  Conversation A  │  [Message 3 — inbound]           │
│      │  Conversation B  │                                  │
│      │  Conversation C  │  ─────────────────────────────   │
│      │  Conversation D  │  [Reply Composer]                │
│      │                  │  [Send]  [AI Draft]              │
└──────┴──────────────────┴──────────────────────────────────┘
```

**Critical design rule:** When an agent opens a conversation, they see the message thread only. No AI panel auto-loads. No customer profile auto-expands. The experience starts clean.

### Contextual Slide-In Panels

When the agent needs more, they request it. Panels slide in from the right without replacing the thread view:

- **Customer Profile panel** — triggered by clicking the customer name in the thread header
- **AI Draft panel** — triggered by clicking "AI Draft" in the reply composer
- **Notes panel** — triggered by clicking "Notes" tab above the composer
- **Edit Compare panel** — triggered by clicking "Compare" after a reply is sent

Panels are dismissible. They do not persist unless the agent pins them.

---

## 6. Module Definitions

### Module 1: Inbox

**Purpose:** The central work surface. Where agents spend most of their time.

**Sub-views (left column filter within inbox):**

| View | Description |
|---|---|
| All | Every open conversation |
| Mine | Conversations assigned to the current agent |
| Unassigned | Conversations with no owner |
| Awaiting Reply | Customer is waiting for a response |
| AI Review Needed | AI flagged Red confidence or missing context |
| Closed | Resolved conversations |

**Conversation list item (each row shows):**
- Customer name and subject
- Message preview (truncated to one line)
- Channel badge (Email / SMS)
- Status badge
- Assigned agent avatar
- AI risk indicator (small colored dot)
- Time since last message

**Thread view (main panel):**
- Clean chronological message thread
- Inbound messages left-aligned, outbound right-aligned
- Internal notes visually distinct (muted background, lock icon)
- Reply composer pinned to the bottom

**Reply Composer:**
- Text area with basic formatting options
- "Send" button — requires confirmation if an AI draft was generated but not used
- "AI Draft" button — opens the AI panel
- "Note" toggle — switches composer to internal note mode
- Tag selector and assign dropdown

---

### Module 2: Contacts

**Purpose:** Unified customer record.

**Contact record shows:** identity (name, email, phone), company association, tags, channel history, linked conversation threads, notes, assigned owner, and last activity timestamp.

**Auto-creation behavior:** When an inbound email arrives from an unknown sender, a contact is automatically created using the email address as the primary key. If a match exists, the conversation is linked to that contact.

---

### Module 3: Companies

**Purpose:** Account-level view for B2B customers.

**Company record shows:** company name, industry, associated contacts, aggregate conversation count, notes, and tags. AI behavior overrides are deferred to V2.

---

### Module 4: Dashboard

**Purpose:** Performance intelligence for managers and QA.

**Manager view widgets:**
- Total conversations this period
- Average first response time
- Average resolution time
- AI draft usage rate (percentage of conversations where AI was used)
- AI acceptance rate (percentage of AI drafts sent with less than 10% edit distance)
- Average edit distance per agent
- Most common edit categories this week
- High-risk conversations flagged this week

**Agent view (self-service):** conversations handled, AI usage rate, average edit distance on AI drafts, most common personal edit reasons, and coaching flags from QA.

**QA view:** reviewed conversations, pass rate, top issue categories, top failing intents, and knowledge gaps identified.

---

### Module 5: Settings

**Purpose:** Org configuration. Most tabs are Admin-only.

| Tab | Contents |
|---|---|
| General | Org name, timezone, language |
| Channels | Connect email (Gmail or Postmark), SMS (Twilio — V1.5) |
| Users | Invite, assign roles, deactivate |
| AI Config | Model selection, confidence thresholds, behavior rules |
| Knowledge | Upload SOPs, FAQs, tone guidelines, forbidden phrases |
| Billing | Plan, usage meter, seat count, payment method |

---

## 7. Core User Flows

### Flow 1: Agent Handles an Inbound Email

```
Inbound email arrives via connected channel
    ↓
System creates or matches contact
System creates conversation record
Conversation appears in Inbox > Unassigned
    ↓
Agent opens conversation
Sees: clean message thread only
    ↓
Agent reads the thread
    ↓
Agent clicks "AI Draft" in composer
AI panel slides in from right
AI generates: draft reply + rationale + confidence level + risk flags
    ↓
Agent reviews the draft

IF Green confidence AND agent approves:
  Agent lightly edits or accepts as-is

IF Yellow or Red confidence:
  Agent edits substantially or writes manually

    ↓
Agent clicks "Send"
System prompts: "Send this reply?" → Agent confirms
Reply is sent

System stores: sent reply, AI draft, edit comparison
Edit Analyzer runs in background
Results feed into Dashboard
```

**Non-negotiable rule: No AI draft is ever sent without explicit agent confirmation.**

---

### Flow 2: Manager Reviews Team Performance

```
Manager opens Dashboard
Sees: volume, response time, AI usage rate, edit rate
    ↓
Manager clicks "Top Edit Categories"
Sees: most common reasons AI drafts were changed this week
    ↓
Manager identifies "Tone adjustment" as top edit reason
Manager opens Settings > Knowledge > Tone Guidelines
Updates tone guidance
    ↓
AI performance improves in next cycle automatically
```

---

### Flow 3: New Agent Onboarding

```
Admin opens Settings > Users
Clicks "Invite User"
Enters email and selects role: Agent
Agent receives invite email
Agent sets password and enters org workspace
    ↓
Agent sees Inbox — their assigned conversations
Agent opens first conversation — sees clean thread view
Agent discovers "AI Draft" button in the composer organically
```

---

## 8. AI Experience Design

### AI Is the Operator — Humans Supervise

The AI does not assist. The AI operates. The human reviews and approves.

This framing changes the UX significantly. AI drafts are the starting point, not the ending point. Agents review, not rubber-stamp. No draft exits the system without a human touching it.

### AI Draft Panel (Slide-In)

When the agent clicks "AI Draft," a panel slides in from the right. It never replaces the thread view.

```
┌─────────────────────────────────────────────┐
│  AI Draft                          [X Close] │
│  ─────────────────────────────────────────  │
│  Confidence: Green — High                   │
│                                             │
│  [Draft text displayed here]                │
│                                             │
│  ─────────────────────────────────────────  │
│  Why this response:                         │
│  "Customer asked about refund policy.       │
│   Matched SOP-12. No missing context."      │
│                                             │
│  Risk flags: None                           │
│                                             │
│  [Use This Draft]   [Dismiss]               │
└─────────────────────────────────────────────┘
```

"Use This Draft" populates the composer. The agent then edits before sending.

### Confidence Model

| Level | Color | Meaning | Recommended Agent Action |
|---|---|---|---|
| High | Green | Enough context, low ambiguity, matched knowledge | Accept with light review |
| Medium | Yellow | Some context missing or ambiguous | Review carefully before sending |
| Low | Red | High uncertainty, policy risk, or missing context | Write manually or heavily edit; consider flagging for QA |

**Confidence is a support signal, not a truth signal.** An AI can be Green and still be wrong. The human always has final say.

### What the AI Uses to Generate a Draft

Input layers processed in order:

1. Org system rules — tone, brand voice, forbidden phrases, mandatory disclosures
2. Relevant knowledge entries — SOPs and FAQs matched by semantic similarity
3. Conversation thread — last N messages and customer history summary
4. Customer profile context — name, account, prior resolution notes
5. Output schema — structured response format requiring draft, confidence, rationale, risk flags

The AI does not see other customers' conversations. The AI does not make up policy.

### Prompting Architecture

Prompts are separated into independent layers — not one giant mega-prompt:

- Layer 1: System role and org rules
- Layer 2: Tone and brand voice
- Layer 3: Knowledge snippets (top 3–5 relevant entries)
- Layer 4: Thread context (last 5 messages)
- Layer 5: Output schema

Each layer is independently versioned. When a layer changes, the version is tracked so edit analysis can correctly attribute changes to the right source.

---

## 9. Edit Analyzer — The Killer Feature

### What It Does

Every time an agent sends a reply — whether they edited an AI draft or wrote manually — the system automatically:

1. Retrieves the AI draft if one was generated
2. Compares it to the final sent reply
3. Runs a programmatic diff
4. Classifies what changed and why using an LLM
5. Stores structured output for dashboards and QA

### The Analysis Pipeline

**Step 1 — Programmatic diff (always runs first):**
Character-level diff producing insertion and deletion counts, replacement counts, edit distance score (0–100), and similarity percentage.

**Step 2 — LLM classification (runs after diff, only if meaningful edits exist):**
What changed (category), why it likely changed (root cause hypothesis), severity (cosmetic / substantive / critical), and whether the issue points to a prompt gap, knowledge gap, or agent preference.

### Change Categories (V1)

| Category | Description |
|---|---|
| Tone adjustment | Agent changed emotional register or formality |
| Clarity rewrite | Agent restructured for comprehension |
| Factual correction | Agent corrected incorrect information in the draft |
| Missing information | Agent added context the AI did not include |
| Policy or compliance fix | Agent corrected a policy violation |
| Personalization | Agent added customer-specific details |
| Empathy improvement | Agent added emotional acknowledgment |
| Grammar and formatting | Surface-level cleanup only |
| Action or step correction | Agent fixed incorrect instructions |

### Transparency — Decision Locked

This was resolved in `technical-build-spec.md`: **the Edit Compare view is optional for agents and standard for managers and QA reviewers.**

In practice this means agents can access the compare view if they choose to, but it is not surfaced prominently in their workflow. Managers and QA reviewers see it as a standard part of their review interface. This maps to Option C from earlier analysis — aggregate access for agents, full visibility for leadership — without requiring a separate product decision.

---

## 10. Design Language

### Recommendation: Clean and Focused

Given the current skeleton's problem of visual overload, Work Hat should feel like a precision tool, not a dashboard. The recommended aesthetic is clean and minimal — similar to Linear or Vercel.

**Visual principles:**

| Principle | Application |
|---|---|
| Whitespace is information | Every element has room to breathe. Density is earned. |
| Hierarchy over decoration | Size, weight, and position communicate importance — not color or icons |
| Neutral base, intentional color | Near-white base. Color is reserved for status signals only. |
| Panels not pages | Contextual information slides in — it does not replace the current view |
| One primary action per screen | Every view has one obvious next action. Secondary actions are discoverable. |

**Recommended color palette:**

| Token | Value | Use |
|---|---|---|
| Background | #F9F9F9 | Base canvas |
| Surface | #FFFFFF | Cards and panels |
| Border | #E5E5E5 | Dividers and panel edges |
| Text primary | #111111 | Body text |
| Text secondary | #6B6B6B | Labels, timestamps, metadata |
| Brand | #2563EB | Primary actions and links |
| Green (AI high) | #16A34A | Green confidence indicator |
| Yellow (AI mid) | #CA8A04 | Yellow confidence indicator |
| Red (AI low) | #DC2626 | Red confidence and alerts |

**Typography:** Inter (system fallback: -apple-system, sans-serif). Body at 14px with 1.5 line height. Headings at 16–20px weight 600. Labels at 12px uppercase.

**Component library:** shadcn/ui — already compatible with Next.js and Tailwind.

---

## 11. Technical Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript | Already in use, strong ecosystem |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent, accessible |
| Auth and backend | Supabase | Auth, Postgres, Storage, and realtime in one |
| Database | Supabase Postgres | Relational, scalable |
| AI | OpenAI GPT-4o — model-agnostic abstraction layer | Start with OpenAI, swap to Claude or Gemini later without rewiring |
| Email ingestion | Postmark inbound webhook | Simpler than Gmail API for V1 |
| Email sending | Resend or Postmark | Clean API, strong deliverability |
| SMS | Twilio — deferred to V1.5 | Do not start with both channels |
| Billing | Stripe | Industry standard |
| Error tracking | Sentry | |
| Product analytics | PostHog | Session replay and funnel analysis |
| Search and retrieval | Postgres full-text search (V1), pgvector embeddings (V2) | Start simple |

### AI Model Abstraction Layer

Build a thin wrapper around the AI provider from day one so swapping models requires zero rewrites at call sites:

```typescript
// lib/ai/client.ts
interface AIClient {
  generateDraft(context: DraftContext): Promise<DraftResult>
  summarizeThread(messages: Message[]): Promise<string>
  analyzeEdits(draft: string, final: string): Promise<EditAnalysis>
  classifyRisk(content: string): Promise<RiskResult>
}
```

---

## 12. Database Schema

This is a summary-level schema aligned with `technical-build-spec.md` and `supabase-schema-migration-plan.md`. For full column constraints, index definitions, enum declarations, and migration file ordering, refer to those documents. When in doubt, the migration plan is the source of truth for implementation.

**Field naming conventions:** all IDs use `uuid default gen_random_uuid()`, timestamps use `timestamptz not null default now()`, all business tables carry `org_id` for tenant isolation.

```sql
-- Organizations
-- Field names: crm_plan / ai_plan (not plan_type / ai_plan_type)
organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  crm_plan text DEFAULT 'free',            -- 'free' | 'starter' | 'growth'
  ai_plan text DEFAULT 'free',             -- 'free' | 'starter' | 'growth'
  created_at timestamptz,
  updated_at timestamptz
)

-- Users
-- auth_user_id is separate from id — maps to Supabase auth.users identity
-- role uses the enum: admin | manager | agent | qa_reviewer
users (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  auth_user_id uuid UNIQUE NOT NULL,       -- references auth.users, kept in public schema
  full_name text,
  email citext NOT NULL,                   -- citext for case-insensitive matching
  role user_role NOT NULL,                 -- enum: 'admin' | 'manager' | 'agent' | 'qa_reviewer'
  status user_status DEFAULT 'pending',    -- enum: 'pending' | 'active' | 'disabled'
  created_at timestamptz,
  updated_at timestamptz
)

-- Companies (must be created before contacts — FK dependency)
companies (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  name text NOT NULL,
  industry text,
  notes text,
  tags jsonb DEFAULT '[]',
  created_at timestamptz,
  updated_at timestamptz
)

-- Contacts
-- Constraint: email IS NOT NULL OR phone IS NOT NULL (at least one identifier required)
contacts (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  company_id uuid REFERENCES companies NULLABLE,
  first_name text,
  last_name text,
  email citext,
  phone text,
  notes text,
  tags jsonb DEFAULT '[]',
  created_at timestamptz,
  updated_at timestamptz
)

-- Channels
channels (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  type channel_type NOT NULL,              -- enum: 'email' | 'sms'
  provider text NOT NULL,                  -- 'postmark' | 'gmail' | 'twilio'
  status channel_status DEFAULT 'active',  -- enum: 'active' | 'disabled' | 'error'
  config_json jsonb,                       -- encrypted at app layer before storage
  created_at timestamptz,
  updated_at timestamptz
)

-- Conversations
-- status: open | closed | waiting_on_customer | waiting_on_internal (NOT 'pending')
-- risk_level and ai_confidence both use the risk_level enum: green | yellow | red
conversations (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  contact_id uuid REFERENCES contacts NOT NULL,
  company_id uuid REFERENCES companies NULLABLE,
  channel_id uuid REFERENCES channels NOT NULL,
  subject text,
  status conversation_status DEFAULT 'open',
  priority text,
  assigned_user_id uuid REFERENCES users NULLABLE,
  risk_level risk_level NULLABLE,          -- enum: 'green' | 'yellow' | 'red'
  ai_confidence risk_level NULLABLE,
  tags jsonb DEFAULT '[]',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz,
  updated_at timestamptz
)

-- Messages
-- Constraint: if sender_type = 'agent' then sender_user_id must not be null
messages (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  conversation_id uuid REFERENCES conversations,
  sender_type sender_type NOT NULL,        -- enum: 'customer' | 'agent' | 'system' | 'ai'
  sender_user_id uuid REFERENCES users NULLABLE,
  direction message_direction NOT NULL,    -- enum: 'inbound' | 'outbound' | 'internal'
  channel_message_id text,                 -- external provider ID, unique per org
  body_text text NOT NULL,
  body_html text,
  subject text,
  metadata_json jsonb DEFAULT '{}',
  created_at timestamptz
)

-- AI Drafts
-- prompt_version is NOT NULL — required for AI auditability and dashboard filtering
-- includes provider/model/token/latency metadata for cost tracking and debugging
ai_drafts (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  conversation_id uuid REFERENCES conversations,
  source_message_id uuid REFERENCES messages NULLABLE,
  generated_by_user_id uuid REFERENCES users NOT NULL,
  draft_text text NOT NULL,
  rationale text,
  confidence_level risk_level,             -- enum: 'green' | 'yellow' | 'red'
  risk_flags jsonb DEFAULT '[]',
  missing_context jsonb DEFAULT '[]',
  recommended_tags jsonb DEFAULT '[]',
  provider text,                           -- 'openai' | 'anthropic' | etc.
  model text,                              -- e.g. 'gpt-4o'
  prompt_version text NOT NULL,
  request_tokens int,
  response_tokens int,
  latency_ms int,
  created_at timestamptz
)

-- Sent Replies
-- message_id links this back to the outbound message record (unique constraint)
-- source_ai_draft_id is null when agent wrote manually without AI
sent_replies (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  conversation_id uuid REFERENCES conversations,
  source_ai_draft_id uuid REFERENCES ai_drafts NULLABLE,
  sent_by_user_id uuid REFERENCES users NOT NULL,
  message_id uuid REFERENCES messages NOT NULL UNIQUE,
  body_text text NOT NULL,
  sent_at timestamptz
)

-- Edit Analyses
-- Unique on sent_reply_id — one analysis per sent reply
-- raw_diff_json and raw_analysis_json are kept for debugging and future classifier eval
edit_analyses (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  conversation_id uuid REFERENCES conversations,
  ai_draft_id uuid REFERENCES ai_drafts NOT NULL,
  sent_reply_id uuid REFERENCES sent_replies NOT NULL UNIQUE,
  edit_distance_score numeric,
  change_percent numeric,
  categories jsonb DEFAULT '[]',
  likely_reason_summary text,
  classification_confidence numeric,
  raw_diff_json jsonb,
  raw_analysis_json jsonb,
  created_at timestamptz
)

-- Knowledge Entries
-- source_file_path / source_storage_path support uploaded documents (Supabase Storage)
-- created_by_user_id tracks who added each entry
knowledge_entries (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  title text NOT NULL,
  entry_type text NOT NULL,                -- 'rule' | 'faq' | 'sop' | 'tone_guide' | 'uploaded_doc'
  content text NOT NULL,
  source_file_path text,                   -- original filename if uploaded
  source_storage_path text,               -- Supabase Storage path: orgs/{org_id}/knowledge/{id}/file.ext
  tags jsonb DEFAULT '[]',
  channel_scope text DEFAULT 'all',        -- 'all' | 'email' | 'sms'
  is_active boolean DEFAULT true,
  created_by_user_id uuid REFERENCES users NOT NULL,
  created_at timestamptz,
  updated_at timestamptz
)

-- Knowledge Chunks
-- Supports chunked retrieval for large knowledge entries and file uploads
-- content_tsv enables Postgres full-text search (V1)
-- embedding column is reserved for pgvector when added in V2
knowledge_chunks (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  knowledge_entry_id uuid REFERENCES knowledge_entries,
  chunk_index int NOT NULL,
  content text NOT NULL,
  content_tsv tsvector,                    -- maintained for full-text search
  embedding vector NULLABLE,              -- reserved for pgvector (V2)
  metadata_json jsonb DEFAULT '{}',
  created_at timestamptz,
  UNIQUE (knowledge_entry_id, chunk_index)
)

-- QA Reviews
-- edit_analysis_id optionally links the review to the structured analysis
qa_reviews (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  conversation_id uuid REFERENCES conversations,
  edit_analysis_id uuid REFERENCES edit_analyses NULLABLE,
  reviewer_user_id uuid REFERENCES users NOT NULL,
  score numeric,                           -- 1 to 5
  result text,                             -- 'pass' | 'flag' | 'fail'
  categories jsonb DEFAULT '[]',
  notes text,
  created_at timestamptz
)

-- Usage Events
-- event_type values: 'ai_draft_generated' | 'ai_summary_generated' |
--                    'edit_analysis_generated' | 'email_sent' | 'email_received'
usage_events (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations,
  user_id uuid REFERENCES users NULLABLE,
  event_type text NOT NULL,
  units int NOT NULL DEFAULT 1,
  metadata_json jsonb,
  created_at timestamptz
)

-- Billing Subscriptions
-- Unique per org. stripe fields null until Stripe is connected.
billing_subscriptions (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations UNIQUE,
  crm_plan text DEFAULT 'free',
  ai_plan text DEFAULT 'free',
  seat_count int DEFAULT 1,
  status text DEFAULT 'trialing',
  renewal_date timestamptz,
  provider_customer_id text,               -- Stripe customer ID
  provider_subscription_id text,           -- Stripe subscription ID
  created_at timestamptz,
  updated_at timestamptz
)
```

### Postgres Enums (declared in migration 0001)

The following states are stable enough to use as enums. Categories that evolve quickly (plan names, knowledge types, edit categories) stay as `text` with app-layer validation.

- `user_role`: admin, manager, agent, qa_reviewer
- `user_status`: pending, active, disabled
- `channel_type`: email, sms
- `channel_status`: active, disabled, error
- `conversation_status`: open, closed, waiting_on_customer, waiting_on_internal
- `risk_level`: green, yellow, red (used for both `risk_level` and `ai_confidence`)
- `sender_type`: customer, agent, system, ai
- `message_direction`: inbound, outbound, internal

---

## 13. V1 Scope — What Is In, What Is Out

### In Scope — Build This

| Area | What We Build |
|---|---|
| Auth | Email and password signup, org creation, invite flow, role assignment |
| Inbox | Conversation list with filters, thread view, reply composer |
| Email channel | Inbound webhook, outbound send, contact auto-creation |
| AI copilot | Draft generation, confidence display, rationale panel, risk flags |
| Human approval gate | No draft can be sent without agent explicitly clicking Send |
| Contacts | Record, linked conversations, notes, tags |
| Companies | Record, linked contacts |
| Edit Analyzer | Diff engine, LLM classification, category storage |
| Dashboard | Manager metrics: volume, response time, AI usage, edit rate |
| Knowledge | Text-based entries, active or inactive toggle, tag filter |
| Settings | Channels, users, AI config, basic org settings |
| Billing | Freemium model, Stripe checkout, usage tracking |

### Out of Scope — Do Not Build in V1

| Area | Why |
|---|---|
| SMS channel | Start with email only. SMS adds webhook and number management complexity. Target V1.5. |
| Workflow automation | Every automation builder becomes a product of its own. Scope trap. |
| Mobile app | Not the primary use case. Agents work at desks. |
| Social channels | No demand signal from ICP yet. |
| Full ticket SLA engine | Over-engineered for target segment. |
| Telephony | Out of scope entirely. |
| Multi-brand or white label | V3 at the earliest. |
| Custom report builder | Dashboard covers V1 needs. |
| Marketplace and integrations | After product-market fit. |
| Campaign management | Work Hat is not a marketing tool. |

---

## 14. Billing Model

### Philosophy

Billing must feel simple externally. Hide technical complexity (token counts, model costs). Customers should understand what they are paying for without reading documentation.

The customer-facing unit of measure is **AI Actions** (1 AI Action = 1 draft generation OR 1 summary OR 1 edit analysis).

### CRM Subscription (per seat per month)

| Plan | Price | Includes |
|---|---|---|
| Free | $0 | 1 seat, basic inbox, 100 AI Actions per month |
| Starter | $29/user | Unlimited seats, all inbox features, basic dashboard |
| Growth | $59/user | Everything in Starter plus QA module and advanced dashboard |

### AI Subscription (per org per month)

| Plan | Price | AI Actions Included |
|---|---|---|
| Free | $0 | 100 AI Actions per month |
| AI Starter | $29 | 2,000 AI Actions per month |
| AI Growth | $99 | 10,000 AI Actions per month |
| Overage | $0.02 per action | After included limit is reached |

### Freemium Entry Strategy

The free tier gets orgs in the door with zero friction, lets them feel the product before committing, and converts them when they hit the action limit or need advanced features.

Free tier limits are firm. When an org hits 100 AI Actions, the AI Draft button is grayed out with a clear upgrade prompt. The inbox continues to function — only AI features are gated.

### V1 Billing Implementation

- Stripe Checkout for plan upgrades
- Usage events tracked in the `usage_events` table
- Monthly reset of `ai_actions_used` on the `organizations` record
- Stripe webhook handles subscription lifecycle events

---

## 15. Build Phases

### Phase 1 — Foundation (Weeks 1–2)
**Goal:** Working skeleton with real auth, routing, and layout shell

- Project setup: Next.js, TypeScript, Tailwind, shadcn/ui
- Supabase: auth, organizations, and users tables
- Auth flow: signup, org creation, invite
- Role-based access control in middleware
- Global layout: sidebar, top bar, module routing
- Inbox shell: conversation list UI with mock data
- Conversation detail: thread view UI with mock data

**Deliverable:** You can log in, create an org, invite a user, and see the inbox with fake data in the correct layout.

---

### Phase 2 — Real Inbox (Weeks 3–4)
**Goal:** Actual email flows in and out

- Channel setup: connect email via Postmark inbound webhook
- Inbound email creates or matches contact, creates conversation, creates message
- Outbound reply via Postmark, stored as sent_reply
- Contact auto-creation on unknown sender
- Real conversation list and thread view using live data
- Assign, tag, and close conversation actions

**Deliverable:** A real email hits the inbox. An agent can read it and reply.

---

### Phase 3 — AI Copilot (Weeks 5–6)
**Goal:** AI generates useful drafts with visible confidence

- Knowledge entries CRUD in settings
- AI draft generation endpoint (OpenAI integration)
- Prompt layer architecture: system rules, tone, knowledge, thread, output schema
- AI Draft slide-in panel: draft, confidence, rationale, risk flags
- "Use This Draft" populates composer
- Human approval gate: confirm before send
- Store ai_drafts on every generation
- Usage event tracking on every AI action

**Deliverable:** Agent opens a conversation, clicks AI Draft, sees a smart draft with confidence and rationale, edits it, confirms, and sends.

---

### Phase 4 — Edit Analyzer (Weeks 7–8)
**Goal:** The killer feature is live

- Store sent_replies with source_ai_draft_id
- Programmatic diff engine on every sent reply
- LLM classification of what changed and why
- Store edit_analyses with categories and severity
- Edit Compare view: side-by-side AI draft vs final sent reply
- Dashboard: edit rate and top change categories

**Deliverable:** Every sent reply is analyzed. Manager can see patterns. Product can improve itself.

---

### Phase 5 — Dashboard (Weeks 9–10)
**Goal:** Manager has real visibility

- Manager dashboard: volume, response time, AI usage rate, acceptance rate, edit patterns
- Agent self-service dashboard
- High-risk conversation list
- Knowledge gap identification from edit analysis data

**Deliverable:** A manager can open the dashboard and answer "Is our AI helping or hurting?"

---

### Phase 6 — Billing (Weeks 11–12)
**Goal:** The product can charge money

- Stripe Checkout integration
- Free tier enforcement with AI action limit gating
- Plan upgrade flow
- Usage display in settings billing tab
- Stripe webhook handling for subscription lifecycle

**Deliverable:** A new org signs up, uses the free tier, hits the limit, upgrades to AI Starter, and pays.

---

## 16. Open Decisions

The following decisions are not yet locked. Each must be resolved before the relevant phase begins. Decisions already locked in `technical-build-spec.md` are marked as closed.

| Decision | Status | Options | Required By |
|---|---|---|---|
| Email provider for V1 | Open | Postmark (simpler webhook) vs Gmail API (deeper integration) | Before Phase 2 |
| Contact merge strategy | Open | Manual only vs auto-merge on exact email match | Before Phase 2 |
| AI model for production | Open | OpenAI GPT-4o vs Anthropic Claude 3.5 | Before Phase 3 |
| SMS timing | Open | V1.5 immediately post-launch vs V2 | Before Phase 3 |
| Dark mode support | Open | Yes from day one vs light only in V1 | Before Phase 1 completes |
| Edit Analyzer agent visibility | **Closed** | Optional for agents, standard for managers/QA (per tech spec) | — |

---

## 17. Rules We Do Not Break

These guardrails apply regardless of feature requests, customer pressure, or scope expansion.

**Conversation-first, not pipeline-first.** Work Hat is not a sales CRM. Do not add deal stages, pipeline views, or funnel visualizations in V1.

**Email first, done right.** Do not start SMS until email is stable, tested, and used by a real user. A bad email experience kills trust faster than no SMS at all.

**Every AI action is measurable.** No AI output goes untracked. Every generation, every edit, every confidence label is stored.

**Diff before LLM.** Run programmatic diff before LLM classification in the edit analyzer. It is cheaper, faster, and more reliable. LLM only classifies what the diff already found.

**Human approval is non-negotiable in V1.** No AI draft is ever sent automatically. No exception. Even if a customer asks for it. Trust must be earned first.

**Billing must feel simple.** Customers see AI Actions, not tokens. Overage is transparent and fair. No hidden costs.

**Scope is locked.** If a feature is not in this document, it does not get built in V1. Add it to a V2 backlog with written justification.

**One window, one job.** No panel opens automatically. Agents see the thread. Everything else is on demand.

---

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-04-03 | Initial PRD — generated from ChatGPT/Codex conversation |
| 2.0 | 2026-04-03 | Full rewrite: layout redesign (modular architecture, slide-in panels), design language, freemium billing model, agent UX decisions |
| 2.1 | 2026-04-03 | Reconciled with technical-build-spec.md and supabase-schema-migration-plan.md: fixed schema (auth_user_id, knowledge_chunks, message_id on sent_replies, provider/token fields on ai_drafts, edit_analysis_id on qa_reviews), corrected conversation statuses, added enum declarations, closed Edit Analyzer visibility decision, added document map |

---

*End of Document*
*Next update: After Phase 1 completes*
*Owner: Teddy A — teddy@xtendops.us*
