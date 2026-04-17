-- ─────────────────────────────────────────────────────────────────────────────
-- 0019_intents.sql
--
-- Intent classification system.
-- Orgs define named intents with keyword trigger lists, a required agent skill,
-- a priority order for conflict resolution (first match wins), and an SLA level.
-- ─────────────────────────────────────────────────────────────────────────────

create type intent_priority_level as enum ('high', 'normal', 'low');

create table if not exists intents (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  name             text not null,
  color            text not null default '#78a17a',   -- hex colour for the pill
  keywords         text[] not null default '{}',       -- trigger words / phrases
  skill_required   text,                               -- agent skill slug (nullable)
  priority_order   int  not null default 100,          -- lower = checked first
  priority_level   intent_priority_level not null default 'normal',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One org can't have two intents with the same name
create unique index intents_org_name_idx on intents (org_id, lower(name));

-- Fast lookup by org ordered for classification
create index intents_org_order_idx on intents (org_id, priority_order);

-- RLS
alter table intents enable row level security;

-- Agents can read their org's intents
create policy "intents_select_org"
  on intents for select
  using (
    org_id in (
      select org_id from users where auth_user_id = auth.uid()
    )
  );

-- Only managers/admins can create/update/delete
create policy "intents_insert_manager"
  on intents for insert
  with check (
    org_id in (
      select org_id from users
      where auth_user_id = auth.uid()
        and role in ('manager', 'admin')
    )
  );

create policy "intents_update_manager"
  on intents for update
  using (
    org_id in (
      select org_id from users
      where auth_user_id = auth.uid()
        and role in ('manager', 'admin')
    )
  );

create policy "intents_delete_manager"
  on intents for delete
  using (
    org_id in (
      select org_id from users
      where auth_user_id = auth.uid()
        and role in ('manager', 'admin')
    )
  );

-- Service role bypass
create policy "intents_service_all"
  on intents for all
  using (auth.role() = 'service_role');

-- Keep updated_at fresh
create or replace function touch_intents_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger intents_updated_at
  before update on intents
  for each row execute function touch_intents_updated_at();
