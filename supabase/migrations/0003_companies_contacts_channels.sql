create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  domain text null,
  industry text null,
  account_owner text not null default '',       -- denormalized owner name for display
  tier text not null default 'standard',        -- standard | pro | enterprise | vip
  health_score integer not null default 100 check (health_score between 0 and 100),
  open_conversations integer not null default 0,
  active_contacts integer not null default 0,
  arr numeric(12,2) null,
  notes text null,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_org_name_idx
  on public.companies (org_id, name);

create index if not exists companies_org_domain_idx
  on public.companies (org_id, domain)
  where domain is not null;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  first_name text null,
  last_name text null,
  full_name text not null default '',
  email citext null,
  phone text null,
  notes text null,
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'active',        -- active | watch | vip
  tier text null,
  preferred_channel text null,
  location text null,
  lifecycle_stage text null,
  last_activity_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_org_company_idx
  on public.contacts (org_id, company_id);

create index if not exists contacts_org_email_idx
  on public.contacts (org_id, email)
  where email is not null;

create index if not exists contacts_org_last_activity_idx
  on public.contacts (org_id, last_activity_at desc);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type public.channel_type not null,
  provider text not null default 'postmark',
  status public.channel_status not null default 'active',
  inbound_address text null,                    -- direct column for fast lookup by inbound webhook
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists channels_org_type_status_idx
  on public.channels (org_id, type, status);

create unique index if not exists channels_inbound_address_unique_idx
  on public.channels (inbound_address)
  where inbound_address is not null;

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists set_contacts_updated_at on public.contacts;
create trigger set_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists set_channels_updated_at on public.channels;
create trigger set_channels_updated_at
before update on public.channels
for each row execute function public.set_updated_at();
