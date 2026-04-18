-- ─────────────────────────────────────────────────────────────────────────────
-- 0023_harden_function_search_paths.sql
--
-- Hardens all SECURITY DEFINER functions against search_path injection.
--
-- Problem:
--   `SET search_path = public` still allows the public schema to be mutated
--   by unprivileged users (since CREATE on public is granted by default).
--   An attacker could shadow system functions by creating objects in public
--   before a SECURITY DEFINER function resolves them.
--
-- Fix:
--   Use `SET search_path = ''` (empty) so the function body must reference
--   all objects with fully-qualified schema names. All function bodies below
--   already use `public.tablename` throughout, so no body changes are needed.
--
-- Addresses Supabase advisor lint: function_search_path_mutable
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
-- ─────────────────────────────────────────────────────────────────────────────

-- ── RLS helper functions (current_org_id, current_user_role, etc.) ───────────

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
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
set search_path = ''
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
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.current_user_can_manage_settings()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('admin', 'manager'), false)
$$;

-- ── handle_new_user trigger ───────────────────────────────────────────────────

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
    coalesce(
      new.raw_user_meta_data->>'organization_name',
      initcap(replace(email_local, '.', ' ')) || ' Workspace'
    ),
    org_slug || '-' || substr(replace(new.id::text, '-', ''), 1, 8)
  )
  returning id into new_org_id;

  insert into public.users (org_id, auth_user_id, full_name, email, role, status)
  values (
    new_org_id,
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', email_local),
    new.email,
    'admin',
    'active'
  );

  return new;
end;
$$;

-- ── increment_knowledge_used_in_drafts ────────────────────────────────────────
-- Was missing set search_path entirely.

create or replace function public.increment_knowledge_used_in_drafts(
  entry_ids uuid[]
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.knowledge_entries
  set used_in_drafts = used_in_drafts + 1
  where id = any(entry_ids);
$$;
