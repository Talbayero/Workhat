# Work Hat CRM

Work Hat CRM is an AI-assisted operations CRM for support and customer operations teams.

## Repository

- `web/` — Next.js application
- `supabase/` — Supabase migration history
- `docs/` — product, architecture, engineering, security, compliance, and SOC 2 readiness documentation

## Documentation

All substantive project documentation is centralized in [docs/README.md](./docs/README.md).

Start there for product context, architecture, security hardening, SOC 2 readiness, runbooks, engineering notes, and archived planning artifacts.

## Local Development

```bash
cd web
npm install
npm run dev
```

## Verification

```bash
cd web
npm test -- --runInBand
npm run type-check
npm run lint
npm run build
```
