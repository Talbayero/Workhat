# Security And Compliance

This document consolidates Work Hat security controls, privacy controls, policy set, and readiness evidence for SOC 2 Type 1/2, ISO 27001, and ISO 27701.

It is not a certification or legal attestation. It is the operating control reference used to prepare for audits and customer security review.

## Compliance Scope

| Area | In Scope |
|---|---|
| Product | Work Hat web app, API routes, conversations, AI drafts, queue/SLA, workflow, audit logs |
| Infrastructure | Vercel, Supabase Auth/Postgres, Upstash Redis, Gmail OAuth, OpenAI, Stripe |
| Data | Customer conversations, contacts, companies, knowledge, AI drafts, edit analysis, audit events, usage data |
| Frameworks | SOC 2 Security plus availability, confidentiality, processing integrity, privacy readiness; ISO 27001 ISMS controls; ISO 27701 privacy controls |

## Control Objectives

1. Only authorized users can access the correct organization.
2. Sensitive actions require explicit capabilities.
3. Customer data is protected in transit and at rest.
4. Secrets are encrypted or stored only in provider-managed secret stores.
5. Security-relevant activity is auditable.
6. Changes are reviewed, tested, and traceable.
7. Incidents are triaged, contained, remediated, and reviewed.
8. Personal data is classified, retained, deleted, and disclosed according to policy.
9. Vendors handling customer or personal data are tracked and reviewed.
10. AI features keep human approval and traceability.

## Policy Set

The active policy set is consolidated here. Separate generated DOCX policy drafts are not active source of truth unless regenerated from this document.

| Policy | Statement | Evidence |
|---|---|---|
| Information Security | Work Hat maintains administrative, technical, and operational controls to protect customer data and platform integrity. | This document, architecture, engineering standards, audit logs |
| Access Control | Access is role/capability based, org-scoped, and reviewed periodically. Privileged access is limited to business need. | Capability code, user records, access review evidence |
| Incident Response | Security and availability incidents follow severity triage, containment, communication, remediation, and postmortem procedures. | Operations runbook, incident tickets/postmortems |
| Change Management | Material changes are committed, reviewed, tested, deployed, and documented. | Git history, CI/build output, migrations, ADRs |
| Data Classification | Customer conversation data, CRM data, AI drafts, edit analysis, and audit logs are confidential. Secrets are restricted. | Data inventory, database schema, secret stores |
| Data Retention And Disposal | Data is retained for operational/legal need and deleted through approved workflows when retention expires or a valid request is processed. | Retention migrations, deletion request records |
| Vendor Risk | Vendors that process customer or personal data are inventoried, reviewed, and assigned owners. | Vendor register evidence |
| Business Continuity / DR | Critical services have documented recovery procedures, backups, provider status checks, and incident escalation paths. | Supabase/Vercel backup evidence, runbook tests |
| Privacy | Personal data is processed for defined product purposes, access is limited, and data subject requests are tracked. | Privacy request records, deletion/export workflows |

## Data Classification

| Class | Examples | Handling |
|---|---|---|
| Public | Marketing copy, public docs | No special restriction |
| Internal | Engineering notes, runbooks, non-secret architecture | Work Hat team access only |
| Confidential | Conversations, contacts, companies, knowledge, AI drafts, edit analysis, customer metadata | Org-scoped access, encryption in transit/at rest, audit where relevant |
| Restricted | OAuth tokens, service role keys, encryption keys, webhook tokens, provider secrets | Secret manager or encrypted storage, never logged, least privilege |

## Privacy Data Inventory

| Data Type | Personal Data Risk | Purpose | Primary Controls |
|---|---|---|---|
| User account | Email, name, role | Authentication and authorization | Supabase Auth, capabilities |
| Contact/company | Customer email, name, company details | CRM context | Org scoping, RLS direction |
| Conversation/message | Customer communications | Support operations | Org scoping, audit, retention |
| AI drafts | Derived customer communication | Suggested replies | Human approval, prompt versioning |
| Edit analysis | Human changes to AI output | Improvement analytics | Org scoping, traceability |
| Audit logs | Actor, action, IP/user agent where captured | Security evidence | Immutable append-only pattern |
| Gmail tokens | OAuth tokens | Mail import/send | Encrypted storage |

## Security Control Matrix

| Domain | Control | Implementation | Evidence |
|---|---|---|---|
| Authentication | Users authenticate through Supabase Auth | Signup/login/reset flows, server-side session validation | `web/src/app/login`, `web/src/proxy.ts` |
| Authorization | Sensitive actions require capabilities | `requireCapability()` in mutating routes | `web/src/lib/auth/capabilities.ts` |
| Tenant Isolation | Data access is org-scoped | `org_id` filters, RLS direction | Supabase migrations, route queries |
| Secrets | Secrets are not plaintext in code/logs | Env vars, encrypted Gmail tokens | Vercel/Supabase env, encryption helper |
| Audit | Security/operational actions are logged | Audit logger and audit tables | `audit_logs`, route calls |
| Rate Limiting | Abuse is throttled | API gateway/rate limit helpers, Redis where configured | security helpers, Redis env |
| Change Control | Changes are tracked and tested | Git, migrations, test/build output | commits, CI/local verification |
| Incident Response | Incidents follow runbook | Severity model and response steps | `operations-runbook.md` |
| Availability | Provider failures have runbook paths | Vercel/Supabase/Gmail/OpenAI checks | status pages, incident logs |
| Processing Integrity | SLA/workflow/AI actions are deterministic and traceable | Stored rule execution, prompt versions, edit metrics | workflow tables, draft records |
| Privacy | Data subject and retention controls are defined | Retention/deletion request model | migrations, request records |
| Vendor Risk | Subprocessors are tracked | Vendor register requirement | vendor review evidence |

## AI Governance Controls

Work Hat uses AI to draft replies and analyze edits. Controls:

- AI does not send customer replies automatically.
- Human edit and approval are mandatory.
- Drafts store prompt version.
- Prompt experiments use deterministic assignment and audit rows.
- AI improvement recommendations must be traceable to edit patterns and source examples.
- Customer data sent to AI providers must follow vendor/privacy review requirements.

## Audit Evidence

Evidence sources:

- Git commits and pull requests.
- Supabase migrations.
- Vercel deployment logs.
- Test/build output.
- Audit logs.
- Workflow execution records.
- SLA state records.
- Prompt experiment assignment records.
- Incident tickets/postmortems.
- Access review records.
- Vendor review records.
- Data deletion/export request records.

## Type 1 And Type 2 Readiness

SOC 2 Type 1 asks whether controls are designed and implemented at a point in time.

SOC 2 Type 2 asks whether those controls operated consistently over an observation period.

Work Hat readiness gaps to close before formal Type 2:

| Gap | Needed Evidence |
|---|---|
| Access reviews | Monthly access review log with reviewer, date, exceptions, remediation |
| Vendor reviews | Vendor register with owner, data type, risk, review date |
| Incident exercises | Tabletop results and remediation tracking |
| Retention execution | Records of purge/deletion jobs and DSAR handling |
| Monitoring review | Weekly alert/error review notes |
| RLS/control sampling | Quarterly sampled review of org isolation controls |
| DR verification | Backup/recovery evidence and restore test notes |

## ISO 27001 Readiness

Work Hat should maintain:

- ISMS scope and asset inventory.
- Risk register.
- Statement of Applicability.
- Access control procedures.
- Supplier security procedure.
- Incident management procedure.
- Backup and recovery procedure.
- Secure development procedure.
- Evidence of management review.

This document is a starting control library, not a complete ISMS.

## ISO 27701 Readiness

Work Hat should maintain:

- Privacy role assignment.
- Data processing purpose inventory.
- Data subject request workflow.
- Retention and deletion schedule.
- Subprocessor list.
- Cross-border transfer assessment where applicable.
- AI provider privacy review.
- Customer-facing privacy notices aligned to actual processing.

## Operating Cadence

| Cadence | Activity | Evidence |
|---|---|---|
| Per change | Tests, docs, migration review, security review where needed | Commit/PR notes |
| Weekly | Review errors, failed jobs, audit anomalies, rate-limit events | Ops review note |
| Monthly | Access review and vendor exception review | Access/vendor logs |
| Quarterly | Incident tabletop, RLS sample, DR review | Exercise records |
| Annually | Policy and risk review | Approved policy/risk updates |

Last updated: April 2026
