create table if not exists public.qa_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  edit_analysis_id uuid null references public.edit_analyses(id) on delete set null,
  reviewer_user_id uuid not null references public.users(id) on delete restrict,
  score numeric(5,2) null,
  result text null,
  categories jsonb not null default '[]'::jsonb,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists qa_reviews_org_reviewer_created_idx
  on public.qa_reviews (org_id, reviewer_user_id, created_at desc);

create index if not exists qa_reviews_org_conversation_created_idx
  on public.qa_reviews (org_id, conversation_id, created_at desc);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid null references public.users(id) on delete set null,
  event_type text not null,
  units integer not null default 1,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_org_event_created_idx
  on public.usage_events (org_id, event_type, created_at desc);

create index if not exists usage_events_org_user_created_idx
  on public.usage_events (org_id, user_id, created_at desc);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider_customer_id text not null,
  provider_subscription_id text null,
  crm_plan text not null default 'starter',
  ai_plan text not null default 'starter',
  seat_count integer not null default 1,
  status text not null default 'trialing',
  renewal_date timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_org_unique unique (org_id)
);

create index if not exists billing_subscriptions_customer_idx
  on public.billing_subscriptions (provider_customer_id);

create index if not exists billing_subscriptions_status_renewal_idx
  on public.billing_subscriptions (status, renewal_date);

drop trigger if exists set_billing_subscriptions_updated_at on public.billing_subscriptions;
create trigger set_billing_subscriptions_updated_at
before update on public.billing_subscriptions
for each row
execute function public.set_updated_at();

comment on table public.qa_reviews is
  'Optional QA scoring and coaching records layered onto edit analyses and conversations.';

comment on table public.usage_events is
  'Metered product and AI activity used for reporting, plan enforcement, and billing.';

comment on table public.billing_subscriptions is
  'Org-level billing state and external provider identifiers for Work Hat plans.';
