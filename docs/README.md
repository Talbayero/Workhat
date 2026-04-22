# Work Hat CRM — Documentation

This folder is the **single source of truth** for all platform documentation. Every decision, architectural fact, convention, and integration note that future contributors (or future-you) will need to understand the system belongs here.

**Rule:** If it isn't in `docs/`, it doesn't exist as official guidance. Planning docs at the repo root (`prd.md`, `technical-build-spec.md`, `supabase-schema-migration-plan.md`) are historical artifacts — useful context, but not authoritative once work is complete. The files in this folder are authoritative.

---

## Contents

| File | What it covers |
|---|---|
| [architecture.md](./architecture.md) | Stack, runtime shape, main surfaces, data model, auth, Supabase usage, integrations, and environment variables |
| [conventions.md](./conventions.md) | How code is organized, named, written, and tested — the rules that keep the codebase consistent |
| [decisions.md](./decisions.md) | Architecture Decision Records — why we made the choices we made, so we don't re-litigate them |

---

## Rules for this folder

1. **All additional platform documentation must be stored here.** Security policies, runbooks, integration guides, onboarding notes — if it describes how this platform works, it lives in `docs/`.

2. **Write for a new contributor who has no context.** Assume they can read the code but don't know why things are the way they are.

3. **Keep docs close to truth.** When you ship a meaningful change (new integration, schema change, a decision reversal), update the relevant doc in the same PR. Stale documentation is worse than no documentation.

4. **Decision records are append-only.** Never delete or edit a decision entry in `decisions.md`. If a decision is reversed, add a new entry that supersedes the old one and links back to it.

5. **Naming convention:** Use lowercase kebab-case for all files added to this folder. One topic per file.

---

## What lives at the repo root (for reference only)

| File | Status |
|---|---|
| `prd.md` | Product Requirements v2.1 — historical. Superseded by shipped code. |
| `technical-build-spec.md` | Original API + data model blueprint — historical. |
| `supabase-schema-migration-plan.md` | DB execution plan — historical. Migrations in `supabase/migrations/` are authoritative. |
| `accessibility-audit.md` | WCAG audit — active reference, may be moved here in the future. |

---

*Last updated: April 2026*
