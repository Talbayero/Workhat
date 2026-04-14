-- Migration 0004: Add relational ownership columns
-- All display/denormalized columns are already in 0003.
-- This adds foreign-key ownership columns that reference users (created in 0002).

alter table public.companies
  add column if not exists account_owner_user_id uuid null references public.users(id) on delete set null;

create index if not exists companies_org_owner_idx
  on public.companies (org_id, account_owner_user_id);

alter table public.contacts
  add column if not exists owner_user_id uuid null references public.users(id) on delete set null;

create index if not exists contacts_org_owner_idx
  on public.contacts (org_id, owner_user_id);
