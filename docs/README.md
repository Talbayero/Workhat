# Work Hat Documentation

This folder is the active documentation source of truth for Work Hat.

Work Hat is a conversation-first CRM and operations system where AI helps teams handle customer communication faster, more consistently, and with measurable improvement. The core loop is:

```text
Customer message -> Work Hat -> AI draft -> human edits -> send -> learn -> improve
```

The documentation set is intentionally small for SOC 2 Type 1/2, ISO 27001, and ISO 27701 readiness. Keep the total file count under 20. Do not add new standalone documents unless they cannot fit coherently into one of the files below.

## Active Documents

| Document | Purpose |
|---|---|
| [product.md](./product.md) | Product definition, modules, MVP scope, and what Work Hat is not |
| [architecture.md](./architecture.md) | System architecture, data model, integration boundaries, and runtime flow |
| [engineering.md](./engineering.md) | Engineering conventions, testing, change control, and implementation standards |
| [security-compliance.md](./security-compliance.md) | Security controls, privacy controls, policies, control matrix, and evidence model |
| [operations-runbook.md](./operations-runbook.md) | On-call, incident response, Gmail OAuth recovery, and operational checks |
| [data-access-and-rls.md](./data-access-and-rls.md) | Supabase access model, RLS expectations, and service-role fallback rules |
| [project-structure.md](./project-structure.md) | Folder boundaries and code placement guardrails |
| [decisions.md](./decisions.md) | Architecture Decision Records. Append-only decision log |

## Documentation Rules

1. Keep documentation in `docs/`.
2. Keep this folder under 20 files.
3. Consolidate related topics instead of creating narrow one-off documents.
4. Update docs in the same change as material product, security, schema, AI, workflow, or operational changes.
5. Treat compliance claims as evidence-backed. If a claim has no evidence path, list it as a gap.
6. ADRs remain append-only. Supersede old decisions with a new ADR instead of rewriting history.
7. Historical planning documents and generated DOCX policy drafts are not active evidence unless reintroduced through `security-compliance.md`.

## Compliance Readiness Position

These docs support readiness work. They are not a certification, legal attestation, or auditor report.

Current readiness targets:

- SOC 2 Type 1: control design and point-in-time implementation evidence.
- SOC 2 Type 2: recurring operation evidence over the observation period.
- ISO 27001: information security management system controls and operational discipline.
- ISO 27701: privacy information management controls for personal data handled in conversations, contacts, companies, AI drafts, edit analysis, and audit logs.

Last updated: April 2026
