# Security And Compliance

This document consolidates Work Hat security controls, privacy controls, quality controls, service-management controls, continuity controls, lifecycle controls, and readiness evidence for SOC 2 Type 1/2, ISO 27001, ISO 27701, HIPAA readiness, ISO 9001 alignment, ISO 20000-1 alignment, ISO 22301 alignment, ISO/IEC/IEEE 12207 alignment, and ISO/IEC 25000 alignment.

It is not a certification or legal attestation. It is the operating control reference used to prepare for audits and customer security review.

## Compliance Scope

| Area | In Scope |
|---|---|
| Product | Work Hat web app, API routes, conversations, AI drafts, queue/SLA, workflow, audit logs |
| Infrastructure | Vercel, Supabase Auth/Postgres, Upstash Redis, Gmail OAuth, OpenAI, Stripe |
| Data | Customer conversations, contacts, companies, knowledge, AI drafts, edit analysis, audit events, usage data |
| Frameworks | SOC 2 Security plus availability, confidentiality, processing integrity, privacy readiness; ISO 27001 ISMS; ISO 27701 PIMS; HIPAA administrative, physical, and technical safeguard readiness; ISO 9001 quality-management alignment; ISO 20000-1 service-management alignment; ISO 22301 continuity alignment; ISO/IEC/IEEE 12207 lifecycle alignment; ISO/IEC 25000 software-quality alignment |

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
11. Product quality, release quality, service quality, continuity, and software lifecycle practices are documented and evidenced.

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
| Quality Management | Product requirements, acceptance criteria, release checks, customer feedback, and corrective actions are tracked. | Product docs, QA evidence, release checklist, defect/remediation log |
| Service Management | Incidents, service requests, change, availability, capacity, and supplier dependencies are managed. | Operations runbook, incident log, monitoring review log, vendor register |
| Business Continuity | Critical service recovery scenarios are defined, tested, and improved. | Backup/restore evidence, continuity exercise records |
| Software Lifecycle | Requirements, design, implementation, verification, release, operation, and maintenance are traceable. | Product docs, architecture docs, tests, migrations, ADRs, commits |
| Software Quality | Functional suitability, reliability, usability, security, maintainability, and portability are reviewed before release. | Test/build evidence, UX checks, security reviews, performance/availability reviews |

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

## Public Privacy Surfaces

Work Hat maintains user-facing privacy and data-request pages in the web app:

- `/privacy` explains what Work Hat collects, why Gmail OAuth is used, how AI drafts and edit analysis work, and that human approval is required before customer replies are sent.
- `/account-deletion` explains how users can request account deletion, workspace data deletion, export, correction, or Gmail disconnection support.
- `/delete-account` aliases the account deletion page for app store and marketplace review conventions.

These pages are product notices. They must not claim SOC 2, ISO 27001, or ISO 27701 certification unless a formal certification has been completed and approved for publication.

## Integrated Control Matrix

The matrix below maps one Work Hat control library to multiple framework targets. It is intentionally readiness-focused and should be validated by qualified auditors or counsel before using it for formal assessment.

| Control Domain | Framework Coverage | Readiness State | Current Implementation / Evidence | Evidence Gaps | Policy / Process Gaps | Product Gaps |
|---|---|---|---|---|---|---|
| Governance, scope, and commitments | SOC 2; ISO 27001; ISO 27701; ISO 9001; ISO 20000-1; ISO 22301 | Partially implemented | Product, architecture, engineering, runbook, and security docs define scope and constraints | Signed management approval, formal scope statement, service commitments, quality objectives | Formal management review cadence | In-product policy surface is basic |
| Risk management | SOC 2; ISO 27001; ISO 27701; HIPAA; ISO 22301 | Gap | Security risks are identified informally through engineering review and runbooks | Risk register, risk owners, treatment plans, residual risk acceptance | Formal risk assessment procedure | No risk dashboard or risk register workflow |
| Asset and data inventory | SOC 2; ISO 27001; ISO 27701; HIPAA; ISO 20000-1 | Partially implemented | Data inventory and core stack are documented; tenant-owned tables are listed in RLS docs | Complete asset inventory, data inventory owner, data retention classification | Asset lifecycle procedure | No automated inventory export |
| Identity and access management | SOC 2; ISO 27001; ISO 27701; HIPAA; ISO 20000-1 | Partially implemented | Supabase Auth, app users, roles, capabilities, RLS helpers | Monthly access review log, privileged access review, offboarding evidence | Access review and joiner/mover/leaver procedure | Settings role visibility needs simplification |
| Tenant isolation and authorization | SOC 2; ISO 27001; ISO 27701; HIPAA | Implemented with monitoring gaps | `org_id` scoping, RLS direction, capability checks, RLS repair migrations | Quarterly RLS sampling, cross-org isolation test evidence | Formal tenant-isolation control review | Temporary admin fallbacks still need retirement after production evidence |
| Secrets and cryptography | SOC 2; ISO 27001; ISO 27701; HIPAA | Partially implemented | Server-only env vars, encrypted Gmail tokens, metadata-only grants | Key rotation evidence, encryption key inventory, secret access review | Secret rotation and emergency revocation procedure | Token encryption key format hardening may remain |
| Gmail OAuth and mailbox security | SOC 2; ISO 27001; ISO 27701; HIPAA readiness | Partially implemented | Gmail OAuth only, stable callback, encrypted tokens, human-approved send | OAuth verification evidence, scope justification, disconnect/revocation evidence | Google API policy review procedure | Live watch readiness depends on production env and Google Cloud setup |
| Change management and SDLC | SOC 2; ISO 27001; ISO 9001; ISO/IEC/IEEE 12207; ISO/IEC 25000 | Partially implemented | Git commits, migrations, tests, engineering standards, ADRs | Consistent PR approval evidence, release checklist records, rollback evidence | Formal release/change procedure with approval thresholds | CI exists but evidence retention process is not formalized |
| Secure development | SOC 2; ISO 27001; HIPAA; ISO/IEC/IEEE 12207; ISO/IEC 25000 | Partially implemented | Thin routes, domain logic in `lib/`, capability requirements, RLS standards | Security test coverage inventory, dependency review evidence, code review evidence | Secure coding checklist ownership | Need systematic tests for all sensitive routes |
| AI governance and traceability | SOC 2 Processing Integrity; SOC 2 Privacy; ISO 27001; ISO 27701; ISO/IEC 25000 | Partially implemented | Human approval, prompt versioning, draft/edit analysis provenance, context version tracking | AI provider review, prompt release evidence, sampled output review | AI acceptable-use and model-risk review procedure | Need stronger user-facing AI consent/copy and output quality sampling |
| Logging, audit, and accountability | SOC 2; ISO 27001; ISO 27701; HIPAA; ISO 20000-1 | Partially implemented | Audit logs, workflow events, route logs, MVP smoke check request IDs | Audit coverage map, log retention evidence, monitoring review log | Audit review cadence and escalation criteria | Need clearer admin audit UI coverage for all sensitive events |
| Incident response | SOC 2; ISO 27001; HIPAA; ISO 20000-1; ISO 22301 | Partially implemented | Severity model and postmortem template in runbook | Incident log, tabletop evidence, communication templates, lessons-learned tracking | Incident response policy approval and training | No in-app incident banner/status mechanism |
| Availability and monitoring | SOC 2 Availability; ISO 27001; ISO 20000-1; ISO 22301 | Partially implemented | Vercel/Supabase/Gmail/OpenAI checks in runbook; Redis rate limiting when configured | Monitoring review log, uptime/SLO evidence, alert configuration inventory | Availability targets and capacity review procedure | Needs production monitoring dashboard ownership |
| Backup, restore, and continuity | SOC 2 Availability; ISO 27001; ISO 22301; HIPAA | Gap | Runbook requires backup/recovery evidence | Backup inventory, restore test evidence, RTO/RPO decisions, continuity exercise | Business continuity and disaster recovery procedure | No user-facing recovery status or tested restore workflow evidence |
| Vendor and subprocessor management | SOC 2; ISO 27001; ISO 27701; HIPAA; ISO 20000-1 | Gap | Vendors are listed in scope: Vercel, Supabase, Upstash, Gmail, OpenAI, Stripe | Vendor register, DPA/BAA status, risk reviews, subprocessor disclosures | Supplier review and approval procedure | Public privacy/subprocessor disclosure needs owner review |
| Privacy management | SOC 2 Privacy; ISO 27701; HIPAA readiness | Partially implemented | Public privacy and deletion pages; data inventory; org scoping | DSAR log, retention schedule, lawful basis/purpose inventory, privacy impact assessment | Privacy request and breach-notification procedure | Export/deletion workflows need stronger operator evidence |
| HIPAA safeguard readiness | HIPAA readiness; ISO 27001; SOC 2 | Gap | Confidentiality controls overlap with security architecture; no HIPAA claims | ePHI decision record, BAA inventory, HIPAA risk analysis, workforce training evidence | HIPAA policies, breach notification procedure, sanction policy | Product must clearly identify whether ePHI is allowed before handling regulated data |
| Quality management | ISO 9001; ISO/IEC 25000; SOC 2 Processing Integrity | Partially implemented | Product truth, MVP path, engineering standards, tests | Quality objectives, defect trend log, customer feedback log, corrective action log | QMS process, nonconformity/corrective action process | No product quality dashboard yet |
| Service management | ISO 20000-1; SOC 2 Availability; ISO 22301 | Partially implemented | Operations runbook, severity levels, recurring operations | Service request log, problem log, change calendar, supplier SLA tracking | Service management procedure and ownership | Support/admin experience still has technical complexity |
| Software lifecycle | ISO/IEC/IEEE 12207; ISO 27001; ISO 9001 | Partially implemented | Product, architecture, engineering, migrations, ADRs, tests | Requirements traceability, verification evidence per release, maintenance log | Lifecycle process definition from idea to retirement | No formal traceability matrix |
| Software quality model | ISO/IEC 25000; ISO 9001; SOC 2 | Partially implemented | Testing commands, UI standards, security standards | Quality attribute acceptance criteria, usability review evidence, reliability tests | Quality gate definition | Limited automated UX/performance regression evidence |

## Readiness Classification

| State | Meaning |
|---|---|
| Implemented | The control exists in product/code/process and has at least some repeatable evidence. |
| Partially implemented | The design exists or the product control exists, but operating evidence or process ownership is incomplete. |
| Evidence gap | The control may exist, but Work Hat does not yet retain enough proof for audit or customer review. |
| Policy / process gap | The product may support the behavior, but the written procedure, owner, cadence, or approval path is missing. |
| Product gap | The application does not yet support the control well enough or exposes a misleading/incomplete user path. |

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

## Evidence Artifact Plan

The artifacts below should be maintained as sections in this document, the operations runbook, or a controlled ticketing/work-management system. Do not create one markdown file per artifact unless the docs set is intentionally restructured.

| Artifact | Owner | Minimum Fields | Cadence | Framework Use |
|---|---|---|---|---|
| Access review log | Security/operations owner | Date, reviewer, users reviewed, privileged users, exceptions, remediation owner, closure date | Monthly | SOC 2, ISO 27001, HIPAA |
| Change management log | Engineering owner | Change ID, summary, risk, approver, tests, migration impact, deploy ID, rollback plan | Per material change | SOC 2, ISO 27001, ISO 9001, ISO/IEC/IEEE 12207 |
| Incident log | Operations owner | Severity, start/end, owner, impact, containment, root cause, corrective actions | Per incident | SOC 2, ISO 27001, HIPAA, ISO 20000-1, ISO 22301 |
| Vendor register | Security/privacy owner | Vendor, service, data processed, risk, DPA/BAA status, owner, review date | Quarterly or on change | SOC 2, ISO 27001, ISO 27701, HIPAA |
| Risk register | Security/leadership owner | Risk, affected assets, likelihood, impact, treatment, owner, due date, residual risk | Monthly review | ISO 27001, ISO 27701, HIPAA, ISO 22301 |
| Asset inventory | Engineering/operations owner | Asset, owner, environment, data class, provider, criticality, lifecycle state | Quarterly | ISO 27001, ISO 20000-1, ISO 22301 |
| Data inventory | Privacy/security owner | Data type, purpose, source, storage, processors, retention, deletion/export path | Quarterly | SOC 2 Privacy, ISO 27701, HIPAA |
| Backup/restore test evidence | Operations owner | System, backup source, restore target, test date, result, RTO/RPO notes, issues | Quarterly | SOC 2 Availability, ISO 27001, ISO 22301 |
| Monitoring review log | Operations owner | Date, alerts/errors reviewed, anomalies, customer impact, actions | Weekly | SOC 2, ISO 20000-1 |
| Test/build evidence | Engineering owner | Commit/deploy, type-check, lint, tests, build, security audit, failures/remediation | Per release | SOC 2, ISO 9001, ISO/IEC 25000 |
| Release checklist | Engineering/product owner | Scope, acceptance criteria, migrations, security review, docs, rollback, smoke test | Per release | SOC 2, ISO 9001, ISO/IEC/IEEE 12207 |
| Privacy request log | Privacy owner | Request type, requester, identity verification, scope, due date, completion, retained exceptions | Per request | ISO 27701, SOC 2 Privacy |
| AI governance log | Product/engineering owner | Prompt/context version, model/provider, review, known risks, rollback plan, sampled output review | Per prompt/model release | SOC 2 Processing Integrity, ISO 27701, ISO/IEC 25000 |
| Corrective action log | Quality owner | Finding, source, root cause, action, owner, due date, verification | Monthly review | ISO 9001, ISO 20000-1, ISO 22301 |

## Request Protection Degradation

Upstash Redis is required for full production rate limiting and dynamic blacklist persistence. During setup or Redis outage, authenticated app APIs fail open with warning logs so onboarding, Gmail setup, AI drafting, and workspace operations remain usable. Public unauthenticated abuse surfaces, such as waitlist submissions, remain fail-closed when the rate-limit store is unavailable.

This is an availability tradeoff and must be treated as a hardening gap until Redis is configured in production.

## Readiness Roadmap By Framework

### SOC 2 Type 1 And Type 2

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

Type 1 design evidence should focus on:

- Final system description and control boundaries.
- Written control matrix and policy set.
- Evidence that key controls exist at a point in time.
- Screenshots or exports of access controls, audit logs, RLS policies, encryption/token handling, CI checks, incident procedure, and vendor inventory.

Type 2 operating evidence should focus on:

- Repeated access reviews.
- Repeated change approvals and test/build records.
- Repeated monitoring reviews.
- Incident and postmortem records when applicable.
- Vendor reviews.
- Backup/restore tests.
- Evidence that exceptions were tracked and remediated.

### ISO 27001 ISMS Readiness

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

Additional ISO 27001 readiness gaps:

- Formal ISMS scope approved by leadership.
- Risk assessment methodology.
- Statement of Applicability.
- Control owners and review cadence.
- Internal audit plan.
- Management review minutes.
- Corrective action process.

### ISO 27701 PIMS Readiness

Work Hat should maintain:

- Privacy role assignment.
- Data processing purpose inventory.
- Data subject request workflow.
- Retention and deletion schedule.
- Subprocessor list.
- Cross-border transfer assessment where applicable.
- AI provider privacy review.
- Customer-facing privacy notices aligned to actual processing.

Additional ISO 27701 readiness gaps:

- Controller/processor role analysis by data flow.
- Privacy impact assessment for Gmail, AI drafts, edit analysis, and Context Engine data.
- Personal data inventory with retention and subprocessors.
- Data subject request procedure and operating evidence.
- Privacy training and privacy incident escalation path.

### HIPAA Readiness

Work Hat should not claim HIPAA compliance or accept regulated ePHI workflows until leadership has made a formal scope decision and required agreements/processes are in place.

Readiness requires:

- Product decision on whether ePHI is allowed, prohibited, or customer-controlled.
- HIPAA risk analysis and risk management plan.
- Administrative safeguard procedures, including workforce access, training, sanction process, contingency planning, and incident response.
- Physical safeguard review for workforce devices and provider-hosted infrastructure responsibilities.
- Technical safeguard evidence for access control, audit controls, integrity controls, authentication, and transmission security.
- Business associate agreement inventory for vendors if Work Hat acts as a business associate.
- Breach notification procedure aligned with counsel review.

Current state: security architecture overlaps with HIPAA safeguard categories, but HIPAA readiness is a gap until ePHI scope, BAAs, training, and formal risk analysis exist.

### ISO 9001 Quality Management Alignment

Work Hat can align quality management around the MVP path and release process.

Required evidence:

- Quality objectives tied to product outcomes, such as Gmail import visibility, AI draft success, send success, and edit-analysis completion.
- Customer feedback log.
- Defect/nonconformity log.
- Corrective action log.
- Release acceptance criteria.
- Management review of quality trends.

Current state: product and engineering standards exist, but formal quality objectives, feedback review, and corrective action evidence are gaps.

### ISO 20000-1 Service Management Alignment

Work Hat can align service management around incident, request, change, availability, supplier, and problem management.

Required evidence:

- Service catalog and service commitments.
- Incident and service request logs.
- Change calendar or release log.
- Problem/root-cause records.
- Supplier review records.
- Availability and capacity review notes.

Current state: operations runbook exists, but recurring service-management evidence is not yet formalized.

### ISO 22301 Business Continuity Alignment

Work Hat should define continuity around customer communication availability, Gmail integration, Supabase data, Vercel app availability, AI provider degradation, and incident communications.

Required evidence:

- Business impact analysis.
- Critical process list.
- RTO/RPO targets.
- Continuity strategy for Vercel, Supabase, Gmail, OpenAI, Upstash, and DNS.
- Backup and restore tests.
- Continuity tabletop exercises.

Current state: incident runbook exists, but business impact analysis, RTO/RPO decisions, and restore exercise evidence are gaps.

### ISO/IEC/IEEE 12207 Software Lifecycle Alignment

Work Hat lifecycle evidence should connect product truth, requirements, architecture, design decisions, implementation, verification, release, operation, maintenance, and retirement.

Required evidence:

- Requirement source for material features.
- ADRs for material architecture decisions.
- Traceability from feature to route/service/migration/test.
- Verification evidence before release.
- Maintenance and deprecation records.

Current state: docs, ADRs, migrations, and tests exist, but formal traceability and lifecycle stage evidence are gaps.

### ISO/IEC 25000 Software Quality Alignment

Work Hat quality evaluation should cover:

- Functional suitability: MVP path works end to end.
- Performance efficiency: core pages and APIs respond within agreed targets.
- Compatibility: browser/device support expectations are defined.
- Usability: Settings and Inbox avoid misleading controls and support the user task.
- Reliability: failures show actionable states and do not silently hide data.
- Security: org isolation, capability checks, safe secret handling.
- Maintainability: route/domain boundaries, tests, docs, migrations.
- Portability: deployability through Vercel/Supabase with documented environment setup.

Current state: engineering standards exist, but measurable quality gates and recurring quality review evidence are gaps.

## 30 / 60 / 90 Day Readiness Roadmap

### First 30 Days: Design Evidence And Control Inventory

1. Approve the compliance scope and service commitments for the Work Hat MVP.
2. Convert this matrix into a control-owner list with owners and review cadences.
3. Start the risk register, vendor register, asset inventory, and data inventory.
4. Start monthly access review and weekly monitoring review logs.
5. Define release checklist evidence for every production deploy.
6. Document whether ePHI is prohibited or conditionally allowed before pursuing HIPAA readiness.
7. Verify public privacy and deletion surfaces match actual data handling.
8. Capture Type 1 point-in-time evidence for authentication, authorization, RLS, Gmail token encryption, audit logs, CI/build, and incident response.

### Days 31-60: Operating Evidence And Process Closure

1. Run the first access review, vendor review, monitoring review, and change review cycle.
2. Run an incident tabletop and record corrective actions.
3. Run a backup/restore test and record RTO/RPO observations.
4. Complete the initial risk assessment and risk treatment plan.
5. Draft Statement of Applicability for ISO 27001 readiness.
6. Complete privacy impact assessment for Gmail OAuth, AI draft generation, edit analysis, and Context Engine V1.
7. Add release evidence retention for tests, build, migration review, security review, and rollback plan.
8. Review support/admin Settings UX to reduce misleading controls and separate admin diagnostics from normal self-serve setup.

### Days 61-90: Audit-Readiness Stabilization

1. Run second and third operating cycles for access review, monitoring review, vendor review, and change management.
2. Close high-priority risk treatment items or document accepted residual risk.
3. Complete continuity tabletop and supplier-dependency review.
4. Sample tenant-isolation controls and sensitive API routes for evidence.
5. Review AI governance evidence for prompt/context versioning, draft provenance, edit-analysis traceability, and human approval.
6. Complete management review covering security, privacy, quality, service, continuity, incidents, vendors, and corrective actions.
7. Decide whether to begin SOC 2 Type 1 readiness review with an auditor.
8. Keep Type 2 readiness separate until controls have operated consistently through the selected observation period.

## Operating Cadence

| Cadence | Activity | Evidence |
|---|---|---|
| Per change | Tests, docs, migration review, security review where needed | Commit/PR notes |
| Weekly | Review errors, failed jobs, audit anomalies, rate-limit events | Ops review note |
| Monthly | Access review and vendor exception review | Access/vendor logs |
| Quarterly | Incident tabletop, RLS sample, DR review | Exercise records |
| Annually | Policy and risk review | Approved policy/risk updates |

## Open Gaps Summary

| Gap Type | Priority | Gap |
|---|---|---|
| Evidence | High | Access reviews, monitoring reviews, vendor reviews, release checklists, and backup/restore tests need retained operating evidence. |
| Policy / Process | High | Formal risk management, supplier management, access review, incident tabletop, release approval, and continuity procedures need owners and cadence. |
| Product | High | Settings must separate normal Gmail setup from admin diagnostics and hide controls that are not fully functional. |
| Product | High | Temporary tenant-scoped admin fallbacks should be retired after production user-scoped RLS reads are proven stable. |
| Privacy | High | Data inventory, privacy impact assessment, DSAR evidence, and subprocessor disclosure readiness need ownership. |
| HIPAA | High | ePHI scope decision, BAA inventory, HIPAA risk analysis, and workforce training are required before HIPAA claims or regulated workflows. |
| Quality | Medium | ISO 9001/25000 alignment needs measurable quality objectives, defect trends, corrective actions, and recurring quality review. |
| Service Management | Medium | ISO 20000-1 alignment needs formal service request, problem, change, supplier, and availability records. |
| Continuity | Medium | ISO 22301 alignment needs BIA, RTO/RPO targets, continuity strategy, and exercises. |
| Lifecycle | Medium | ISO/IEC/IEEE 12207 alignment needs stronger requirement-to-test-to-release traceability. |

## Framework References

Framework details should be verified against official publications before formal audit work. Current roadmap assumptions are based on the public descriptions of SOC 2 trust service categories, ISO management-system standards, and HHS HIPAA Security Rule safeguard categories. Do not copy proprietary standard text into this repository.

Last updated: May 2026
