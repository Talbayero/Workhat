-- Migration 0010: Add Stripe billing fields to organizations
-- Run in Supabase SQL editor or via CLI

alter table public.organizations
  add column if not exists stripe_customer_id    text null,
  add column if not exists stripe_subscription_id text null,
  add column if not exists plan_status            text not null default 'free';

-- crm_plan already exists (starter/pro/scale), we reuse it.
-- plan_status tracks: free | trialing | active | past_due | canceled

comment on column public.organizations.stripe_customer_id is
  'Stripe customer ID (cus_xxx), set on first checkout.';

comment on column public.organizations.stripe_subscription_id is
  'Active Stripe subscription ID (sub_xxx).';

comment on column public.organizations.plan_status is
  'Billing lifecycle: free | trialing | active | past_due | canceled.';
