-- Migration 0004: Enrich companies, contacts, channels
-- Uses ADD COLUMN IF NOT EXISTS throughout so it's safe to run
-- even if 0003 already included these columns.

alter table public.companies
  add column if not exists domain text null,
  add column if not exists account_owner_user_id uuid null references public.users(id) on delete set null,
  add column if not exists tier text not null default 'standard',
  add column if not exists health_score integer not null default 100 check (health_score between 0 and 100),
  add column if not exists arr numeric(12,2) null;

create index if not exists companies_org_owner_idx
  on public.companies (org_id, account_owner_user_id);

alter table public.contacts
  add column if not exists owner_user_id uuid null references public.users(id) on delete set null;

create index if not exists contacts_org_owner_idx
  on public.contacts (org_id, owner_user_id);

create index if not exists contacts_org_last_activity_idx
  on public.contacts (org_id, last_activity_at desc);
