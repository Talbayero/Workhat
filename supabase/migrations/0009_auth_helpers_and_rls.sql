create or replace function public.current_org_id()
returns uuid
language sql
stable
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
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.current_user_can_manage_settings()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_user_role() in ('admin', 'manager'), false)
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.channels enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ai_drafts enable row level security;
alter table public.sent_replies enable row level security;
alter table public.edit_analyses enable row level security;
alter table public.knowledge_entries enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.qa_reviews enable row level security;
alter table public.usage_events enable row level security;
alter table public.billing_subscriptions enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
for select to authenticated
using (id = public.current_org_id());

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations
for update to authenticated
using (
  id = public.current_org_id()
  and public.current_user_is_admin()
)
with check (
  id = public.current_org_id()
  and public.current_user_is_admin()
);

drop policy if exists users_select_org_access on public.users;
create policy users_select_org_access on public.users
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin on public.users
for insert to authenticated
with check (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
);

drop policy if exists users_update_admin on public.users;
create policy users_update_admin on public.users
for update to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
);

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users
for delete to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
);

drop policy if exists channels_select_org_access on public.channels;
create policy channels_select_org_access on public.channels
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists channels_manage_settings on public.channels;
create policy channels_manage_settings on public.channels
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
);

drop policy if exists companies_org_access on public.companies;
create policy companies_org_access on public.companies
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists contacts_org_access on public.contacts;
create policy contacts_org_access on public.contacts
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists conversations_org_access on public.conversations;
create policy conversations_org_access on public.conversations
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists messages_org_access on public.messages;
create policy messages_org_access on public.messages
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists ai_drafts_org_access on public.ai_drafts;
create policy ai_drafts_org_access on public.ai_drafts
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists sent_replies_org_access on public.sent_replies;
create policy sent_replies_org_access on public.sent_replies
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists edit_analyses_org_access on public.edit_analyses;
create policy edit_analyses_org_access on public.edit_analyses
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists knowledge_entries_select_org_access on public.knowledge_entries;
create policy knowledge_entries_select_org_access on public.knowledge_entries
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists knowledge_entries_manage_settings on public.knowledge_entries;
create policy knowledge_entries_manage_settings on public.knowledge_entries
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
);

drop policy if exists knowledge_chunks_select_org_access on public.knowledge_chunks;
create policy knowledge_chunks_select_org_access on public.knowledge_chunks
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists knowledge_chunks_manage_settings on public.knowledge_chunks;
create policy knowledge_chunks_manage_settings on public.knowledge_chunks
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_can_manage_settings()
);

drop policy if exists qa_reviews_org_access on public.qa_reviews;
create policy qa_reviews_org_access on public.qa_reviews
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists usage_events_org_access on public.usage_events;
create policy usage_events_org_access on public.usage_events
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists billing_subscriptions_select_org_access on public.billing_subscriptions;
create policy billing_subscriptions_select_org_access on public.billing_subscriptions
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists billing_subscriptions_manage_admin on public.billing_subscriptions;
create policy billing_subscriptions_manage_admin on public.billing_subscriptions
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
)
with check (
  org_id = public.current_org_id()
  and public.current_user_is_admin()
);
