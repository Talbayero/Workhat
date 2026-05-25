-- Org-scoped AI setup V1.
--
-- Supports three customer-facing modes:
-- - work_hat_managed: Work Hat platform OpenAI key/model
-- - byo: customer-managed OpenAI key encrypted at rest
-- - disabled: no AI draft generation for the workspace
--
-- Provider V1 is intentionally OpenAI-only. Other providers must not be shown
-- until a server adapter, tests, and security review exist.

create table if not exists public.org_ai_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  ai_mode text not null default 'work_hat_managed',
  default_provider text not null default 'openai',
  default_model text not null default 'gpt-4o',
  status text not null default 'not_configured',
  last_validated_at timestamptz null,
  last_error_code text null,
  last_error_message text null,
  updated_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_ai_settings_mode_check check (ai_mode in ('work_hat_managed', 'byo', 'disabled')),
  constraint org_ai_settings_provider_check check (default_provider = 'openai'),
  constraint org_ai_settings_status_check check (status in ('active', 'error', 'disabled', 'not_configured')),
  constraint org_ai_settings_model_length check (char_length(default_model) between 1 and 120)
);

create table if not exists public.org_ai_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'openai',
  encrypted_api_key text not null,
  key_hint text not null default '',
  status text not null default 'active',
  last_validated_at timestamptz null,
  last_error_code text null,
  last_error_message text null,
  created_by uuid null references public.users(id) on delete set null,
  updated_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_ai_provider_credentials_provider_check check (provider = 'openai'),
  constraint org_ai_provider_credentials_status_check check (status in ('active', 'error', 'disabled')),
  constraint org_ai_provider_credentials_org_provider_unique unique (org_id, provider)
);

alter table public.ai_drafts
  add column if not exists ai_mode text not null default 'work_hat_managed';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_drafts_ai_mode_check'
      and conrelid = 'public.ai_drafts'::regclass
  ) then
    alter table public.ai_drafts
      add constraint ai_drafts_ai_mode_check
      check (ai_mode in ('work_hat_managed', 'byo', 'disabled'));
  end if;
end $$;

create index if not exists org_ai_settings_status_idx
  on public.org_ai_settings (status, ai_mode);

create index if not exists org_ai_provider_credentials_org_provider_status_idx
  on public.org_ai_provider_credentials (org_id, provider, status);

create index if not exists ai_drafts_org_ai_mode_created_idx
  on public.ai_drafts (org_id, ai_mode, created_at desc);

drop trigger if exists set_org_ai_settings_updated_at on public.org_ai_settings;
create trigger set_org_ai_settings_updated_at
before update on public.org_ai_settings
for each row
execute function public.set_updated_at();

drop trigger if exists set_org_ai_provider_credentials_updated_at on public.org_ai_provider_credentials;
create trigger set_org_ai_provider_credentials_updated_at
before update on public.org_ai_provider_credentials
for each row
execute function public.set_updated_at();

alter table public.org_ai_settings enable row level security;
alter table public.org_ai_provider_credentials enable row level security;

grant select, insert, update, delete on table public.org_ai_settings to authenticated;

-- Credentials contain encrypted customer API keys and remain server-only.
revoke all on table public.org_ai_provider_credentials from authenticated;

drop policy if exists org_ai_settings_select_org on public.org_ai_settings;
create policy org_ai_settings_select_org on public.org_ai_settings
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists org_ai_settings_manage_ai on public.org_ai_settings;
create policy org_ai_settings_manage_ai on public.org_ai_settings
for all to authenticated
using (
  org_id = public.current_org_id()
  and (public.current_user_has_capability('ai.configure') or public.current_user_has_capability('settings.manage'))
)
with check (
  org_id = public.current_org_id()
  and (public.current_user_has_capability('ai.configure') or public.current_user_has_capability('settings.manage'))
);

drop policy if exists org_ai_provider_credentials_service_all on public.org_ai_provider_credentials;
create policy org_ai_provider_credentials_service_all on public.org_ai_provider_credentials
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

comment on table public.org_ai_settings is
  'Org-scoped AI draft setup. V1 supports Work Hat-managed OpenAI, customer-managed OpenAI key, or disabled AI drafting.';

comment on table public.org_ai_provider_credentials is
  'Server-only encrypted AI provider credentials. Authenticated clients must never read encrypted API keys.';

comment on column public.org_ai_provider_credentials.encrypted_api_key is
  'Encrypted OpenAI API key using AI_PROVIDER_KEY_ENCRYPTION_KEY. Never return to browsers or logs.';

comment on column public.ai_drafts.ai_mode is
  'AI setup mode used when the draft was generated: work_hat_managed or byo. Disabled mode cannot create drafts.';
