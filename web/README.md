# Work Hat CRM

An AI-first operations CRM built for customer support and BPO teams. Agents receive inbound email, get an AI-generated reply draft, review and edit it, then send — with every edit tracked so quality improves over time.

---

## What it does

- **Inbox** — unified email inbox with conversation threading, intent classification, and risk scoring
- **AI Drafts** — GPT-4o generates reply drafts grounded in your knowledge base; agents review and approve before anything is sent
- **Edit Analyzer** — tracks every change an agent makes to an AI draft, feeding a continuous improvement loop
- **Knowledge Base** — vector-indexed articles and tone guides that the AI retrieves at draft time using semantic search
- **Contacts & Companies** — CRM records linked to conversations
- **QA Reviews** — structured quality scoring for sent replies
- **Gmail Integration** — two-way Gmail sync via OAuth and Pub/Sub push notifications
- **Multi-tenant** — each organization's data is fully isolated via Row Level Security

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase (Postgres + RLS + pgvector) |
| Auth | Supabase Auth (magic link) |
| AI | OpenAI GPT-4o + text-embedding-3-small |
| Email in | Postmark inbound webhook |
| Email out | Resend |
| Gmail | Google OAuth 2.0 + Gmail API + Pub/Sub |
| Billing | Stripe (Checkout + webhooks) |
| Deployment | Vercel |

---

## Prerequisites

- Node.js 20+
- A Supabase project (free tier works for development)
- An OpenAI API key
- A Google Cloud project with the Gmail API and Pub/Sub API enabled (for Gmail integration)

---

## Local setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd WorkHat/web

# 2. Install dependencies
npm install

# 3. Copy the env file and fill in values (see below)
cp .env.example .env.local

# 4. Run database migrations
# In the Supabase dashboard, run the SQL files in supabase/migrations/ in order.

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in each value.

### Required for core app

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Your app's public URL (e.g. `https://work-hat.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key (`sb_secret_...`) or legacy service_role JWT. Required for server-side DB writes and Gmail sync. |

### Required for AI

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | Model to use (default: `gpt-4o`) |

### Required for inbound email (Postmark)

| Variable | Description |
|---|---|
| `POSTMARK_INBOUND_TOKEN` | Shared secret sent by Postmark as `X-Inbound-Token`. Required — requests without a valid token are rejected. |
| `POSTMARK_SERVER_TOKEN` | Postmark server token (for sending) |
| `RESEND_API_KEY` | Resend API key (alternative send provider) |

### Required for Gmail integration

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID (must end in `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret |
| `EMAIL_TOKEN_ENCRYPTION_KEY` | 32-byte base64 key used to encrypt stored OAuth tokens. Generate with `openssl rand -base64 32`. |
| `GOOGLE_PUBSUB_TOPIC` | Pub/Sub topic for Gmail push notifications. Format: `projects/{project-id}/topics/{topic-name}` |
| `GMAIL_PUSH_TOKEN` | Shared secret appended to the push endpoint as `?token=...`. Use a long random value. |
| `CRON_SECRET` | Secret for the Vercel Cron job that renews Gmail watch subscriptions. |

### Required for billing

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe Price ID for Pro monthly plan |
| `STRIPE_PRICE_PRO_ANNUAL` | Stripe Price ID for Pro annual plan |
| `STRIPE_PRICE_SCALE_MONTHLY` | Stripe Price ID for Scale monthly plan |
| `STRIPE_PRICE_SCALE_ANNUAL` | Stripe Price ID for Scale annual plan |

### Optional security

| Variable | Description |
|---|---|
| `SECURITY_IP_BLACKLIST` | Comma-separated list of IPs to block at the gateway level |
| `SECURITY_DYNAMIC_BLACKLIST_TTL_MS` | How long a dynamically-blocked IP stays blocked (default: 15 minutes) |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret for bot protection on public forms |

---

## Project structure

```
web/
├── src/
│   ├── app/
│   │   ├── api/               # All API routes (Next.js Route Handlers)
│   │   │   ├── ai/draft/      # AI reply draft generation
│   │   │   ├── conversations/ # Conversation CRUD
│   │   │   ├── contacts/      # Contact CRUD
│   │   │   ├── companies/     # Company CRUD
│   │   │   ├── email/         # Gmail OAuth, sync, push, watch
│   │   │   ├── inbound/email/ # Postmark webhook receiver
│   │   │   ├── knowledge/     # Knowledge base CRUD + gap analysis
│   │   │   ├── intents/       # Intent configuration
│   │   │   ├── org/           # Organization creation
│   │   │   ├── settings/      # Org and team settings
│   │   │   ├── stripe/        # Billing checkout + webhooks
│   │   │   └── ...
│   │   ├── inbox/             # Inbox UI
│   │   ├── contacts/          # Contacts UI
│   │   ├── companies/         # Companies UI
│   │   ├── knowledge/         # Knowledge base UI
│   │   ├── dashboard/         # Analytics dashboard
│   │   ├── settings/          # Settings UI
│   │   ├── [lang]/            # Internationalized marketing pages
│   │   └── demo/              # Public demo (no auth)
│   ├── lib/
│   │   ├── ai/                # AI abstraction layer (provider-agnostic)
│   │   ├── auth/              # App user resolution
│   │   ├── email-connector/   # Gmail OAuth, sync, encryption
│   │   ├── security/          # API gateway, rate limiting, circuit breaker
│   │   └── supabase/          # DB clients (server, client, admin)
│   └── middleware.ts          # Auth routing + API gateway
├── next.config.ts             # Security headers, Turbopack config
├── vercel.json                # Cron job schedule
└── .env.example               # Environment variable template
```

---

## Running in production (Vercel)

1. Push the `web/` directory to a Vercel project.
2. Set all environment variables in the Vercel dashboard.
3. The `vercel.json` cron job runs `/api/email/gmail/renew-watches` daily at 07:00 UTC to renew Gmail watch subscriptions before they expire.
4. Configure Postmark's inbound domain and webhook URL to point to `/api/inbound/email`.
5. Configure your Google Pub/Sub push subscription to deliver to `/api/email/gmail/push?token=<GMAIL_PUSH_TOKEN>`.

---

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |

---

## License

Private — all rights reserved.
