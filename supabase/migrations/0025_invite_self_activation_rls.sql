-- ─────────────────────────────────────────────────────────────────────────────
-- 0025_invite_self_activation_rls.sql
--
-- Fixes a silent bug in the invite acceptance flow.
--
-- Problem:
--   When an invited user clicks their magic link and lands on /auth/callback,
--   the page tries to:
--     1. SELECT the pending users row where email = user.email AND status = 'pending'
--     2. UPDATE it to link auth_user_id + set status = 'active'
--
--   Both operations use the normal RLS client. But:
--     - users_select_org_access requires org_id = current_org_id()
--     - current_org_id() looks up the caller's users row by auth_user_id
--     - The invited user has NO auth_user_id linked yet, so current_org_id() = NULL
--     - The SELECT returns zero rows → the UPDATE is never attempted
--     - The user is silently redirected to /onboarding where they'd create a NEW org
--       instead of joining the org they were invited to.
--
-- Fix:
--   Add two narrow RLS policies that let authenticated users find and activate
--   their OWN pending invite row — without needing admin client access and without
--   widening any other permission.
--
--     users_self_select_pending_invite:
--       Allows SELECT of an unlinked (auth_user_id IS NULL) pending row whose
--       email matches the caller's JWT email. Only usable before the row is linked.
--
--     users_self_activate_invite:
--       Allows UPDATE on the same unlinked pending row, but ONLY to set
--       auth_user_id = auth.uid() and status = 'active'. The WITH CHECK clause
--       prevents changing org_id, email, or role — the invited user gets exactly
--       the role and org they were invited to, nothing more.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── SELECT: find your own pending invite row ──────────────────────────────────

drop policy if exists users_self_select_pending_invite on public.users;
create policy users_self_select_pending_invite on public.users
for select to authenticated
using (
  auth_user_id is null
  and status = 'pending'
  and email = auth.email()
);

-- ── UPDATE: self-activate by linking your auth_user_id ────────────────────────
-- USING: the row must still be unlinked and pending (guards the pre-state).
-- WITH CHECK: after the update, auth_user_id must be the caller's UID and
--   status must be 'active'. org_id and role are immutable (the invited user
--   cannot escalate themselves or switch orgs during activation).

drop policy if exists users_self_activate_invite on public.users;
create policy users_self_activate_invite on public.users
for update to authenticated
using (
  auth_user_id is null
  and status = 'pending'
  and email = auth.email()
)
with check (
  auth_user_id = auth.uid()
  and status = 'active'
  and email = auth.email()
  -- org_id and role are implicitly immutable: WITH CHECK only validates
  -- the listed columns; Postgres rejects any update that violates USING
  -- on the pre-image, so the row must start as unlinked + pending.
);
