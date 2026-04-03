# Work Hat CRM

Work Hat CRM is an AI-first operations CRM for support teams. This workspace currently contains:

- `web/`: the Next.js app
- `supabase/`: SQL migrations for the database
- product and implementation planning docs at the repo root

## Current Status

The app has a Milestone 1 product shell in place:

- inbox route
- conversation detail route
- dashboard placeholder
- login and onboarding placeholders
- Work Hat branding aligned with `work-hat.com`

## Local Development

From the app directory:

```bash
cd web
npm install
npm run dev
```

Production check:

```bash
cd web
npm run build
```

## GitHub + Vercel

Recommended setup:

1. Push this workspace to GitHub.
2. Import the repo into Vercel.
3. Set the project Root Directory to `web`.
4. Use the default Next.js build settings.
5. Add environment variables from `web/.env.example`.
6. Attach the `work-hat.com` domain after the first deploy.

## Database

Initial migrations live in:

- `supabase/migrations/0001_extensions_and_enums.sql`
- `supabase/migrations/0002_organizations_and_users.sql`
- `supabase/migrations/0003_companies_contacts_channels.sql`

Supporting planning docs:

- `prd.md`
- `technical-build-spec.md`
- `supabase-schema-migration-plan.md`
