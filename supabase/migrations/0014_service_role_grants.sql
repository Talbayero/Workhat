-- Migration 0014: Explicit service-role grants.
--
-- Supabase normally grants these by default, but making them explicit prevents
-- onboarding/admin API routes from failing with "permission denied" after
-- migrations, restores, or manually-created schemas.

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines in schema public to service_role;

grant execute on function public.bootstrap_user_organization(text, text, text)
  to authenticated, service_role;

grant execute on function public.increment_company_open_conversations(uuid)
  to authenticated, service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;

alter default privileges in schema public
  grant all privileges on sequences to service_role;

alter default privileges in schema public
  grant all privileges on functions to service_role;
