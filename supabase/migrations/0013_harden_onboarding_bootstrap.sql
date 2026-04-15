-- Migration 0013: Harden first-user onboarding.
--
-- Goals:
-- 1. Make RLS helper functions SECURITY DEFINER so policies can resolve the
--    current user's org without recursively depending on the same policies.
-- 2. Add a safe bootstrap RPC for first-user org setup when the app does not
--    have a usable service-role key.

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.org_id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role::text
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.current_user_can_manage_settings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'manager'), false)
$$;

create or replace function public.bootstrap_user_organization(
  p_org_name text,
  p_support_email text default '',
  p_timezone text default 'America/New_York'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_org_name text := nullif(trim(p_org_name), '');
  v_support_email text := coalesce(nullif(trim(p_support_email), ''), '');
  v_timezone text := coalesce(nullif(trim(p_timezone), ''), 'America/New_York');
  v_user_id uuid;
  v_user_role text;
  v_org_id uuid;
  v_slug_base text;
  v_slug text;
  v_suffix integer := 1;
  v_inbound_address text;
  v_channel_id uuid;
  v_created boolean := false;
begin
  if v_auth_user_id is null then
    raise exception 'Unauthorized'
      using errcode = '28000';
  end if;

  if v_org_name is null then
    raise exception 'Organization name is required'
      using errcode = '22023';
  end if;

  select u.id, u.org_id, u.role::text
    into v_user_id, v_org_id, v_user_role
  from public.users u
  where u.auth_user_id = v_auth_user_id
  limit 1;

  v_slug_base := lower(regexp_replace(v_org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);
  if v_slug_base = '' then
    v_slug_base := 'org';
  end if;

  if v_org_id is null then
    v_slug := v_slug_base;
    while exists (select 1 from public.organizations where slug = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug := v_slug_base || '-' || v_suffix::text;
    end loop;

    insert into public.organizations (name, slug, crm_plan, ai_plan)
    values (v_org_name, v_slug, 'starter', 'starter')
    returning id into v_org_id;

    insert into public.users (
      org_id,
      auth_user_id,
      full_name,
      email,
      role,
      status
    )
    values (
      v_org_id,
      v_auth_user_id,
      coalesce(nullif(split_part(v_email, '@', 1), ''), 'Admin'),
      coalesce(nullif(v_email, ''), v_auth_user_id::text || '@unknown.local'),
      'admin',
      'active'
    )
    returning id, role::text into v_user_id, v_user_role;

    v_created := true;
  else
    update public.organizations
      set name = v_org_name
    where id = v_org_id;

    select slug into v_slug
    from public.organizations
    where id = v_org_id;
  end if;

  select slug into v_slug
  from public.organizations
  where id = v_org_id;

  v_inbound_address := 'inbound+' || v_slug || '@work-hat.com';

  select id into v_channel_id
  from public.channels
  where org_id = v_org_id
    and type = 'email'
  limit 1;

  if v_channel_id is null then
    insert into public.channels (
      org_id,
      type,
      provider,
      status,
      inbound_address,
      config_json
    )
    values (
      v_org_id,
      'email',
      'postmark',
      'active',
      v_inbound_address,
      jsonb_build_object(
        'support_email', v_support_email,
        'from_name', v_org_name,
        'timezone', v_timezone,
        'inbound_address', v_inbound_address
      )
    );
  else
    update public.channels
      set inbound_address = v_inbound_address,
          config_json = coalesce(config_json, '{}'::jsonb) ||
            jsonb_build_object(
              'support_email', v_support_email,
              'from_name', v_org_name,
              'timezone', v_timezone,
              'inbound_address', v_inbound_address
            )
    where id = v_channel_id;
  end if;

  return jsonb_build_object(
    'org', jsonb_build_object(
      'id', v_org_id,
      'name', v_org_name,
      'slug', v_slug
    ),
    'user', jsonb_build_object(
      'id', v_user_id,
      'role', v_user_role
    ),
    'created', v_created,
    'method', 'rpc'
  );
end;
$$;

grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_can_manage_settings() to authenticated;
grant execute on function public.bootstrap_user_organization(text, text, text) to authenticated;

create or replace function public.increment_company_open_conversations(
  p_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.companies
    set open_conversations = open_conversations + 1
  where id = p_company_id;
end;
$$;

grant execute on function public.increment_company_open_conversations(uuid) to authenticated;
