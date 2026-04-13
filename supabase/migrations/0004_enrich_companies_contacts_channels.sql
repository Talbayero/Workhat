alter table public.companies
  add column if not exists domain text null,
  add column if not exists account_owner_user_id uuid null references public.users(id) on delete set null,
  add column if not exists tier text not null default 'standard',
  add column if not exists health_score integer not null default 100 check (health_score between 0 and 100),
  add column if not exists open_conversations integer not null default 0,
  add column if not exists arr numeric(12,2) null;

create index if not exists companies_org_owner_idx
  on public.companies (org_id, account_owner_user_id);

alter table public.contacts
  add column if not exists owner_user_id uuid null references public.users(id) on delete set null,
  add column if not exists full_name text,
  add column if not exists status text not null default 'active',
  add column if not exists tier text null,
  add column if not exists preferred_channel text null,
  add column if not exists location text null,
  add column if not exists lifecycle_stage text null,
  add column if not exists last_activity_at timestamptz null;

update public.contacts
set full_name = trim(
  concat_ws(
    ' ',
    nullif(first_name, ''),
    nullif(last_name, '')
  )
)
where full_name is null;

update public.contacts
set full_name = coalesce(email::text, phone, 'Unknown contact')
where full_name is null or full_name = '';

alter table public.contacts
  alter column full_name set not null;

create index if not exists contacts_org_owner_idx
  on public.contacts (org_id, owner_user_id);

create index if not exists contacts_org_last_activity_idx
  on public.contacts (org_id, last_activity_at desc);

comment on column public.companies.domain is
  'Primary company domain for matching, display, and future enrichment.';

comment on column public.companies.account_owner_user_id is
  'Primary internal owner for the company/account relationship.';

comment on column public.contacts.full_name is
  'Display-ready contact name derived from first and last name when needed.';

comment on column public.contacts.owner_user_id is
  'Primary internal owner for the contact relationship.';
