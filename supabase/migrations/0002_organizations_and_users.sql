create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  crm_plan text not null default 'starter',
  ai_plan text not null default 'starter',
  website_domain text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_unique unique (slug)
);

create index if not exists organizations_slug_idx
  on public.organizations (slug);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email citext not null,
  role public.user_role not null,
  status public.user_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_auth_user_id_unique unique (auth_user_id),
  constraint users_org_id_email_unique unique (org_id, email)
);

create index if not exists users_org_role_idx
  on public.users (org_id, role);

create index if not exists users_org_status_idx
  on public.users (org_id, status);

create index if not exists users_org_email_idx
  on public.users (org_id, email);

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

comment on table public.organizations is
  'Top-level tenant record for each Work Hat customer organization.';

comment on column public.organizations.website_domain is
  'Primary customer website or brand domain, useful for workspace setup and future email alignment.';

comment on table public.users is
  'Application users scoped to an organization and linked to Supabase auth identities.';
