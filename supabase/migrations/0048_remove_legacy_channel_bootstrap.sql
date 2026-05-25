-- Migration 0048 — Keep workspace bootstrap Gmail-only for MVP
--
-- Work Hat's MVP mailbox path is Gmail OAuth. The bootstrap RPC should create
-- only the organization and first admin user; Gmail OAuth callback creates the
-- active Gmail channel/connection after the user connects a mailbox.

create or replace function public.bootstrap_user_organization(
  p_org_name text,
  p_support_email text default '',
  p_timezone text default 'America/New_York'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email        text := coalesce(auth.jwt() ->> 'email', '');
  v_org_name     text := nullif(left(trim(p_org_name), 200), '');
  v_user_id      uuid;
  v_user_role    text;
  v_org_id       uuid;
  v_slug_base    text;
  v_slug         text;
  v_suffix       integer := 1;
  v_created      boolean := false;
begin
  perform p_support_email;
  perform p_timezone;

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
    v_slug := left(v_slug_base, 50);
    while exists (select 1 from public.organizations where slug = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug := left(v_slug_base, 50) || '-' || v_suffix::text;
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
      left(coalesce(nullif(split_part(v_email, '@', 1), ''), 'Admin'), 100),
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
  end if;

  select slug into v_slug
  from public.organizations
  where id = v_org_id;

  return jsonb_build_object(
    'org', jsonb_build_object(
      'id',   v_org_id,
      'name', v_org_name,
      'slug', v_slug
    ),
    'user', jsonb_build_object(
      'id',   v_user_id,
      'role', v_user_role
    ),
    'created', v_created,
    'method',  'rpc'
  );
end;
$$;

grant execute on function public.bootstrap_user_organization(text, text, text)
  to authenticated, service_role;
