# SOC 2 Readiness

This document is the active SOC 2 Type 1 and Type 2 readiness map for Work Hat CRM. It is not a legal attestation. It is the internal control and evidence guide used to prepare for auditor review.

## Scope

| Area | In Scope |
|---|---|
| Product | Work Hat CRM web app, API routes, AI draft pipeline, queue/SLA, workflow engine, audit logs |
| Infrastructure | Vercel-hosted Next.js app, Supabase Auth/Postgres, Upstash Redis rate limiting, Gmail/custom inbound email, Stripe, OpenAI |
| Data | Customer conversations, CRM records, knowledge entries, AI drafts, edit analyses, audit events, usage events |
| Trust Services Criteria | Security is primary. Availability, confidentiality, and privacy are readiness targets. Processing integrity applies to SLA/workflow/audit/AI operational logic. |

## Type 1 vs Type 2 Readiness

| Readiness Area | Type 1 Need | Type 2 Need |
|---|---|---|
| Control design | Policies, architecture, control owners, and implementation evidence exist at a point in time | Same controls operate consistently over the observation period |
| Access control | Role/capability model and review procedure documented | Periodic access reviews, joiner/mover/leaver evidence, exception tracking |
| Change management | Documented change flow and commit/deployment records | Consistent PR/review/test/deploy evidence for sampled changes |
| Incident response | Policy, runbook, severity model, communication path | Incident log, tabletop evidence, postmortems, remediation tracking |
| Vendor risk | Vendor inventory and risk review procedure | Review cadence and renewal evidence |
| Data protection | Data classification, retention, deletion, encryption approach | Evidence that deletion/retention/access procedures are performed |
| Monitoring | Logging and alerting design | Alert review, incident tickets, uptime/error trend evidence |

## Control Map

| Control Domain | Current Implementation | Primary Evidence |
|---|---|---|
| Authentication | Supabase Auth with server-side `getUser()` validation | `docs/architecture.md`, `web/src/proxy.ts` |
| Authorization | Capability checks layered over role presets and org-scoped data access | `docs/security-hardening.md`, `web/src/lib/auth/capabilities.ts` |
| Tenant isolation | Org filters in application queries plus RLS direction in Supabase | `docs/architecture.md`, `supabase/migrations/` |
| Authenticated write protection | API write routes require explicit capability checks before mutation | `docs/security-hardening.md`, `web/src/app/api/**/route.ts` |
| Privileged writes | Service-role/admin client reserved for trusted system writes | `docs/decisions.md`, `docs/security-hardening.md` |
| Audit logging | Security and operational actions stored in audit logs | `docs/security-hardening.md`, `web/src/lib/security/audit-logger.ts` |
| API abuse protection | API gateway and rate limiting with Upstash Redis fallback behavior | `docs/security-hardening.md`, `web/src/lib/security/api-gateway.ts` |
| Change management | Git history, branch/commit review practice, migrations | `docs/conventions.md`, `docs/decisions.md` |
| AI governance | Prompt version persistence, human approval, prompt experiment assignment audit | `docs/prompt-experimentation.md`, `docs/ai-improvement-engine.md` |
| Incident response | On-call runbook and security procedures | `docs/on-call-runbook.md`, `docs/security-hardening.md` |
| Accessibility | WCAG audit retained as compliance-adjacent product quality evidence | `docs/compliance/accessibility-audit.md` |

## Evidence Inventory

| Evidence | Location | Cadence |
|---|---|---|
| Policies | `docs/POL-*.docx` | Review at least annually and after major control changes |
| SOC 2 gap analysis | `docs/compliance/WorkHat_SOC2_Gap_Analysis.docx` | Refresh before formal readiness assessment |
| Architecture and system boundaries | `docs/architecture.md` | Update with material architecture changes |
| ADRs | `docs/decisions.md` | Append for significant technical/control decisions |
| Security hardening notes | `docs/security-hardening.md` | Update after security-impacting changes |
| Incident runbook | `docs/on-call-runbook.md` | Review after incidents/tabletops |
| Database migration history | `supabase/migrations/` | Every schema change |
| Test and build commands | `docs/conventions.md`, `web/package.json` | Every toolchain change |
| Hardening verification | Local `lint`, `type-check`, `test`, `build`, route-capability scan, and migration/status scan outputs | Capture in PR notes or release evidence after each hardening pass |

## Current Readiness Gaps

| Gap | SOC 2 Impact | Suggested Next Step |
|---|---|---|
| Formal access review evidence is not yet centralized | Type 2 operating effectiveness | Create an access review log template and require monthly review evidence |
| Vendor inventory is policy-only unless maintained elsewhere | Security/confidentiality | Add vendor register with owner, data type, review date, and risk rating |
| Incident evidence log is not yet a first-class artifact | Type 2 incident response evidence | Add `docs/compliance/incident-log-template.md` or ticketing procedure |
| Retention/deletion controls need execution evidence | Privacy/confidentiality | Document deletion request workflow and evidence capture |
| Monitoring/alert review evidence needs cadence | Availability/security | Define weekly alert review checklist and storage location |
| RLS implementation should be periodically sampled | Security/confidentiality | Add quarterly RLS policy review checklist |

## Readiness Operating Rhythm

| Cadence | Activity | Owner |
|---|---|---|
| Per change | Update docs for schema, security, AI, workflow, or architecture changes | Change author |
| Weekly | Review errors, rate limits, audit anomalies, failed background jobs | Engineering owner |
| Monthly | Access review, vendor exceptions, open risk review | Security/control owner |
| Quarterly | Tabletop incident exercise, RLS/control sample, disaster recovery review | Leadership + engineering |
| Annually | Policy review and approval | Leadership |

## Auditor-Friendly Notes

- Keep evidence immutable where practical: Git history, migration files, audit logs, deployment logs, and ticket links are preferred.
- Avoid relying on narrative claims without evidence. Every readiness claim should point to code, configuration, logs, tickets, or signed policy.
- Type 1 asks whether controls are designed and implemented. Type 2 asks whether they operated consistently. The same docs can support both, but Type 2 needs dated recurring evidence.
