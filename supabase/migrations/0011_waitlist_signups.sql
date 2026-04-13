-- Migration 0011: Waitlist signups table
-- Run in Supabase SQL editor

create table if not exists public.waitlist_signups (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null,
  role        text null,
  source      text null,
  ip_address  text null,
  status      text not null default 'pending',  -- pending | approved | rejected
  approved_at timestamptz null,
  created_at  timestamptz not null default now(),
  constraint waitlist_signups_email_unique unique (email)
);

create index if not exists waitlist_signups_status_idx
  on public.waitlist_signups (status, created_at desc);

comment on table public.waitlist_signups is
  'Waitlist signups from the work-hat.com landing page.';

comment on column public.waitlist_signups.status is
  'pending = not yet reviewed, approved = granted access, rejected = declined.';
