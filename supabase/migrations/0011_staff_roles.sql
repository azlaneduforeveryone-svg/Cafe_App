-- TablePulse: staff roles (owner, manager, reception, waiter), invite links, table assignment,
-- waiter visibility setting and an activity log for money and menu actions.
-- Run after 0010 (SQL Editor > paste > Run). Safe to re-run. Same security model: server only.
--
-- One login belongs to exactly one restaurant (staff.user_id is the primary key), always.

-- Roles. "host" (unused until now) becomes "reception".
alter table public.staff drop constraint if exists staff_role_check;
update public.staff set role = 'reception' where role = 'host';
alter table public.staff add constraint staff_role_check check (role in ('owner', 'manager', 'reception', 'waiter'));
alter table public.staff add column if not exists phone      text not null default '';
alter table public.staff add column if not exists invited_by uuid references auth.users (id) on delete set null;
create unique index if not exists staff_one_owner on public.staff (restaurant_id) where role = 'owner';

-- Waiters see every table, or only the ones assigned to them (the manager decides).
alter table public.restaurants add column if not exists waiter_scope text not null default 'all';
do $$ begin
  alter table public.restaurants add constraint restaurants_waiter_scope_chk check (waiter_scope in ('all', 'assigned'));
exception when duplicate_object then null; end $$;

-- Tables are assigned to a real staff account (the old free-text name stays as a label).
alter table public.restaurant_tables add column if not exists assigned_staff_id uuid references public.staff (user_id) on delete set null;

-- One-time invite links. Only a hash of the token is stored; the link itself is shown once.
create table if not exists public.staff_invites (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  token_hash    text not null unique,
  name          text not null check (char_length(name) between 1 and 60),
  role          text not null check (role in ('manager', 'reception', 'waiter')),
  contact_type  text not null check (contact_type in ('email', 'phone')),
  contact       text not null check (char_length(contact) between 5 and 120),
  created_by    uuid references auth.users (id) on delete set null,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists staff_invites_restaurant_idx on public.staff_invites (restaurant_id, created_at desc);

-- Who did what: payments, rewards, order approvals and cancellations, menu and price changes, staff changes.
create table if not exists public.staff_activity (
  id            bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  staff_id      uuid references auth.users (id) on delete set null,
  staff_name    text not null default '',
  staff_role    text not null default '',
  action        text not null check (char_length(action) between 1 and 40),
  target        text not null default '' check (char_length(target) <= 120),
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists staff_activity_restaurant_idx on public.staff_activity (restaurant_id, created_at desc);

alter table public.staff_invites  enable row level security;
alter table public.staff_activity enable row level security;
grant select, insert, update, delete on public.staff_invites, public.staff_activity to service_role;
revoke all on public.staff_invites, public.staff_activity from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Accept an invite: claims it (once), adds the staff row, checks the seat limit again.
-- The auth user is created by the server just before this call.
-- Errors: invite_invalid, seats_full, already_staff
-- ---------------------------------------------------------------------------
create or replace function public.tp_accept_invite(p_token_hash text, p_user_id uuid, p_phone text)
returns public.staff
language plpgsql set search_path = public, pg_temp as $$
declare
  i     public.staff_invites;
  r     public.restaurants;
  seats int;
  used  int;
  s     public.staff;
begin
  select * into i from staff_invites where token_hash = p_token_hash for update;
  if not found or i.used_at is not null or i.expires_at < now() then raise exception 'invite_invalid'; end if;
  if exists (select 1 from staff where user_id = p_user_id) then raise exception 'already_staff'; end if;
  select * into r from restaurants where id = i.restaurant_id for update;
  seats := case when public.tp_is_pro(r) then 20 else 2 end;
  select count(*) into used from staff where restaurant_id = r.id and role <> 'owner';
  if used >= seats then raise exception 'seats_full'; end if;
  insert into staff (user_id, restaurant_id, name, role, phone, invited_by)
  values (p_user_id, r.id, i.name, i.role, coalesce(p_phone, ''), i.created_by)
  returning * into s;
  update staff_invites set used_at = now() where id = i.id;
  insert into staff_activity (restaurant_id, staff_id, staff_name, staff_role, action, target)
  values (r.id, p_user_id, i.name, i.role, 'staff_joined', i.name);
  return s;
end $$;

revoke all on function public.tp_accept_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.tp_accept_invite(text, uuid, text) to service_role;
