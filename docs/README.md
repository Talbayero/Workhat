# Work Hat CRM Documentation

This folder is the single source of truth for Work Hat CRM documentation.

Rule: if it describes how the platform works, how it is operated, how it is secured, or how readiness evidence is maintained, it belongs in `docs/`.

## Active Documentation

| File | Purpose |
|---|---|
| [product.md](./product.md) | Current product shape, module map, principles, and scope |
| [architecture.md](./architecture.md) | Stack, runtime shape, data model, auth, Supabase, integrations, and env vars |
| [TECHNICAL.md](./TECHNICAL.md) | Detailed technical reference and API/data model notes |
| [conventions.md](./conventions.md) | Engineering conventions for app structure, data access, auth, API routes, testing, and naming |
| [decisions.md](./decisions.md) | Architecture Decision Records |
| [security-hardening.md](./security-hardening.md) | Authorization, audit logging, rate limiting, validation, data protection, and incident response |
| [on-call-runbook.md](./on-call-runbook.md) | Operational incident response procedures |
| [workflow-engine.md](./workflow-engine.md) | Lean event/rules engine and execution safeguards |
| [sla-and-queue-health.md](./sla-and-queue-health.md) | SLA policies, snapshots, queue health, and refresh model |
| [ai-improvement-engine.md](./ai-improvement-engine.md) | Prompt analytics, edit pattern clustering, and knowledge gap insights |
| [prompt-experimentation.md](./prompt-experimentation.md) | Controlled prompt experiments, deterministic assignment, persistence, and rollback |
| [email-channels.md](./email-channels.md) | Gmail and custom inbound email setup, payload contract, diagnostics, and demo verification |

## Compliance And SOC 2 Readiness

| Folder / File | Purpose |
|---|---|
| [compliance/](./compliance/) | SOC 2 readiness, accessibility audit, and gap-analysis artifacts |
| [compliance/soc2-readiness.md](./compliance/soc2-readiness.md) | Active SOC 2 Type 1/2 readiness map and evidence inventory |
| `POL-*.docx` | Policy set for information security, access control, incident response, change management, retention, vendor risk, BCDR, and privacy |

## Engineering Notes

| Folder / File | Purpose |
|---|---|
| [engineering/](./engineering/) | Internal engineering notes centralized from source folders |
| [engineering/code-quality-standards.md](./engineering/code-quality-standards.md) | Verification commands, TypeScript, validation, authorization, and change evidence standards |
| [engineering/internal-platform-notes.md](./engineering/internal-platform-notes.md) | Admin client helper usage, request-scoped caching, and Supabase layout |
| [engineering/data-integrity-testing.md](./engineering/data-integrity-testing.md) | Data integrity and state-machine testing strategy |

## Archive

| Folder / File | Purpose |
|---|---|
| [archive/](./archive/) | Historical planning and implementation context |
| [archive/implementation-history.md](./archive/implementation-history.md) | Compressed history of hardening/phase reports |
| [archive/planning/](./archive/planning/) | Original PRD, technical build spec, and Supabase migration planning artifacts |

Archived documents are context only. Active docs above are authoritative.

## Documentation Rules

1. Store substantive documentation under `docs/`.
2. Keep the repo root README short and point back here.
3. Do not place markdown documentation under `web/src/` or `supabase/`; centralize it here instead.
4. Update docs in the same PR as material product, architecture, security, schema, AI, or workflow changes.
5. Keep ADRs append-only. Supersede decisions with new entries rather than rewriting history.
6. Treat SOC 2 evidence as dated, reviewable artifacts. A claim without evidence should become a readiness gap.

Last updated: April 2026
