-- ─────────────────────────────────────────────────────────────────────────────
-- 0026_harden_trigger_length_caps.sql
--
-- Adds explicit length caps to all DB-layer paths that write user-controlled
-- strings to users.full_name and organizations.name without going through the
-- app-layer validation that already enforces these limits.
--
-- Gaps closed:
--
--   1. handle_new_user() trigger (0023):
--      • full_name written from raw_user_meta_data->>'full_name' — a user can
--        call supabase.auth.updateUser() with an arbitrarily long string before
--        their first sign-in, causing an oversized write into users.full_name.
--      • organizations.name written from raw_user_meta_data->>'organization_name'
--        with no cap.
--      • organizations.slug derived from email local part — RFC 5321 allows up
--        to 64 chars; no explicit cap was applied.
--
--   2. bootstrap_user_organization() RPC (0024):
--      • full_name uses split_part(v_email, '@', 1) which is bounded in
--        practice but has no explicit left() cap.
--      • v_org_name is validated at the app layer (≤ 200 chars), but this RPC
--        is callable directly by any authenticated user — the DB must enforce
--        the cap itself.
--
--   3. DB-level CHECK constraints (defense-in-depth last line):
--      • NOT VALID skips the scan of existing rows (safe to add on live data).
--        Only new inserts and updates on the affected columns must satisfy the
--        constraint. Run VALIDATE CONSTRAINT during a maintenance window if a
--        full backfill audit is desired.
--
-- Length caps (match application-layer constants):
--   users.full_name        ≤ 100
--   organizations.name     ≤ 200
--   organizations.slug     ≤ 60  (internal only, but slug tokens appear in
--                                  inbound email addresses and URLs)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. DB-level CHECK constraints ────────────────────────────────────────────

alter table public.users
  add constraint users_full_name_length
  check (char_length(full_name) <= 100)
  not valid;

alter table public.organizations
  add constraint organizations_name_length
  check (char_length(name) <= 200)
  not valid;

alter table public.organizations
  add constraint organizations_slug_length
  check (char_length(slug) <= 60)
  not valid;


-- ── 2. handle_new_user() — add left() caps ────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  email_local text;
  org_slug text;
begin
  email_local := split_part(coalesce(new.email, 'workspace'), '@', 1);
  org_slug := lower(regexp_replace(email_local, '[^a-zA-Z0-9]+', '-', 'g'));

  insert into public.organizations (name, slug)
  values (
    -- Cap org name at 200 chars. raw_user_meta_data is caller-controlled.
    left(coalesce(
      new.raw_user_meta_data->>'organization_name',
      initcap(replace(email_local, '.', ' ')) || ' Workspace'
    ), 200),
    -- Cap slug at 60 chars. RFC 5321 allows 64-char local parts; the suffix
    -- adds 9 more characters, so an explicit cap is necessary.
    left(org_slug || '-' || substr(replace(new.id::text, '-', ''), 1, 8), 60)
  )
  returning id into new_org_id;

  insert into public.users (org_id, auth_user_id, full_name, email, role, status)
  values (
    new_org_id,
    new.id,
    -- Cap full_name at 100 chars. raw_user_meta_data->>'full_name' is
    -- caller-controlled and can be set to arbitrary length before sign-in.
    left(coalesce(new.raw_user_meta_data->>'full_name', email_local), 100),
    new.email,
    'admin',
    'active'
  );

  return new;
end;
$$;


-- ── 3. bootstrap_user_organization() — add left() caps ───────────────────────
--
-- This RPC is SECURITY DEFINER and callable by any authenticated user, so it
-- must enforce length limits independently of the app layer.

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
  -- Cap org name early: trim → cap at 200 → treat empty as null.
  v_org_name     text := nullif(left(trim(p_org_name), 200), '');
  v_support_email text := coalesce(nullif(trim(p_support_email), ''), '');
  v_timezone     text := coalesce(nullif(trim(p_timezone), ''), 'America/New_York');
  v_user_id      uuid;
  v_user_role    text;
  v_org_id       uuid;
  v_slug_base    text;
  v_slug         text;
  v_suffix       integer := 1;
  v_inbound_address text;
  v_channel_id   uuid;
  v_created      boolean := false;
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
    v_slug := left(v_slug_base, 50);  -- leave room for collision suffix
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
      -- Cap full_name at 100 chars. The email local part has no DB-level
      -- length constraint, so an explicit left() is required here.
      left(coalesce(nullif(split_part(v_email, '@', 1), ''), 'Admin'), 100),
      coalesce(nullif(v_email, ''), v_auth_user_id::text || '@unknown.local'),
      'admin',
      'active'
    )
    returning id, role::text into v_user_id, v_user_role;

    v_created := true;
  else
    update public.organizations
      set name = v_org_name   -- already capped to 200 in the declare block
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
        'from_name',     v_org_name,
        'timezone',      v_timezone,
        'inbound_address', v_inbound_address
      )
    );
  else
    update public.channels
      set inbound_address = v_inbound_address,
          config_json = coalesce(config_json, '{}'::jsonb) ||
            jsonb_build_object(
              'support_email', v_support_email,
              'from_name',     v_org_name,
              'timezone',      v_timezone,
              'inbound_address', v_inbound_address
            )
    where id = v_channel_id;
  end if;

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
