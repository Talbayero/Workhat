create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'user_role'
  ) then
    create type public.user_role as enum ('admin', 'manager', 'agent', 'qa_reviewer');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'user_status'
  ) then
    create type public.user_status as enum ('pending', 'active', 'disabled');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'channel_type'
  ) then
    create type public.channel_type as enum ('email', 'sms');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'channel_status'
  ) then
    create type public.channel_status as enum ('active', 'disabled', 'error');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'conversation_status'
  ) then
    create type public.conversation_status as enum (
      'open',
      'closed',
      'waiting_on_customer',
      'waiting_on_internal'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'risk_level'
  ) then
    create type public.risk_level as enum ('green', 'yellow', 'red');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'sender_type'
  ) then
    create type public.sender_type as enum ('customer', 'agent', 'system', 'ai');
  end if;

  if not exists (
    select 1
    from pg_type
    where typname = 'message_direction'
  ) then
    create type public.message_direction as enum ('inbound', 'outbound', 'internal');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Automatically refreshes updated_at on mutable rows.';
