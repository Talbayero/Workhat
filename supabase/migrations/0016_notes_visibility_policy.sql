-- Split messages RLS into two explicit policies:
--   1. All non-note messages: visible to all org members
--   2. Internal notes (is_note = true): restricted to team roles only
--      (agents, managers, admins — not 'viewer' or future customer roles)
--
-- Current behavior is unchanged since all auth users are team members.
-- This protects against future customer-facing auth portals accidentally
-- exposing internal notes.

drop policy if exists messages_org_access on public.messages;

-- Non-note messages: all org members can read/write
create policy messages_non_notes_org_access on public.messages
for all to authenticated
using (
  org_id = public.current_org_id()
  and is_note = false
)
with check (
  org_id = public.current_org_id()
  and is_note = false
);

-- Internal notes: only team members (not viewer-only or customer roles)
create policy messages_notes_team_only on public.messages
for all to authenticated
using (
  org_id = public.current_org_id()
  and is_note = true
  and public.current_user_role() in ('admin', 'manager', 'agent', 'qa_reviewer')
)
with check (
  org_id = public.current_org_id()
  and is_note = true
  and public.current_user_role() in ('admin', 'manager', 'agent', 'qa_reviewer')
);
