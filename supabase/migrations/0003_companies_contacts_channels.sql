create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  industry text null,
  notes text null,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_org_name_idx
  on public.companies (org_id, name);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  first_name text null,
  last_name text null,
  email citext null,
  phone text null,
  notes text null,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_requires_identifier check (
    email is not null or phone is not null
  )
);

create index if not exists contacts_org_company_idx
  on public.contacts (org_id, company_id);

create index if not exists contacts_org_email_idx
  on public.contacts (org_id, email)
  where email is not null;

create index if not exists contacts_org_phone_idx
  on public.contacts (org_id, phone)
  where phone is not null;

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type public.channel_type not null,
  provider text not null,
  status public.channel_status not null default 'active',
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists channels_org_type_status_idx
  on public.channels (org_id, type, status);

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
before update on public.companies
for each row
execute function public.set_updated_at();

drop trigger if exists set_contacts_updated_at on public.contacts;
create trigger set_contacts_updated_at
before update on public.contacts
for each row
execute function public.set_updated_at();

drop trigger if exists set_channels_updated_at on public.channels;
create trigger set_channels_updated_at
before update on public.channels
for each row
execute function public.set_updated_at();

comment on table public.companies is
  'Organization-scoped company or account records linked to contacts and conversations.';

comment on table public.contacts is
  'Customer contact records matched primarily by email at launch and by phone after SMS support ships.';

comment on table public.channels is
  'Configured communication channels for an organization, designed for email launch and SMS follow-up.';
