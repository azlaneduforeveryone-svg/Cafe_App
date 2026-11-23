-- TablePulse: dining tables, secure table QR sessions, call-waiter alerts, guest Wi-Fi.
-- Run after 0005 (SQL Editor > paste > Run). Safe to re-run.
--
-- Security model (unchanged): RLS is on with no policies, so the public API keys can read or
-- write nothing. Only the app's server (service_role) touches these tables.
--   * Each table has a secret printed in its QR code. Scanning it opens (or joins) the table's
--     current session; the guest's phone gets the session token in an httpOnly cookie, never in
--     the address bar, so a photo of a guest's screen is useless.
--   * Every order from a table waits for staff approval before the kitchen sees it, so someone
--     who photographed the QR and orders from outside is caught at the approval step.
--   * Closing the table ends the session: old phones lose access at once.
--   * Rotating a table's QR secret makes printed copies of the old code useless.

-- ---------------------------------------------------------------------------
-- Guest Wi-Fi (shown only to guests with an open table session)
-- ---------------------------------------------------------------------------
alter table public.restaurants add column if not exists wifi_ssid     text not null default '';
alter table public.restaurants add column if not exists wifi_password text not null default '';
do $$ begin
  alter table public.restaurants add constraint restaurants_wifi_chk check (char_length(wifi_ssid) <= 64 and char_length(wifi_password) <= 64);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.restaurant_tables (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants (id) on delete cascade,
  table_number        text not null check (char_length(table_number) between 1 and 12),
  capacity            int  not null default 4 check (capacity between 1 and 40),
  section_id          text not null default '',
  assigned_staff_name text not null default '' check (char_length(assigned_staff_name) <= 40),
  qr_secret           text not null default replace(gen_random_uuid()::text, '-', ''),
  sort                int  not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (restaurant_id, table_number)
);
create index if not exists restaurant_tables_restaurant_idx on public.restaurant_tables (restaurant_id, sort);

-- One open session per table at a time (a party sitting there).
create table if not exists public.table_sessions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_id      uuid not null references public.restaurant_tables (id) on delete cascade,
  token         text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  entry_id      uuid references public.entries (id) on delete set null,   -- waitlist party seated here, if any
  opened_by     text not null check (opened_by in ('guest', 'staff')),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz
);
create unique index if not exists table_sessions_one_open on public.table_sessions (table_id) where closed_at is null;
create index if not exists table_sessions_restaurant_idx on public.table_sessions (restaurant_id, opened_at desc);
create index if not exists table_sessions_entry_idx on public.table_sessions (entry_id) where entry_id is not null;

-- ---------------------------------------------------------------------------
-- Call-waiter alerts. At most one unresolved alert of each type per session.
-- ---------------------------------------------------------------------------
create table if not exists public.service_alerts (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants (id) on delete cascade,
  table_id        uuid not null references public.restaurant_tables (id) on delete cascade,
  session_id      uuid not null references public.table_sessions (id) on delete cascade,
  alert_type      text not null check (alert_type in ('water', 'napkins', 'bill', 'help')),
  status          text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  created_at      timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at     timestamptz
);
create unique index if not exists service_alerts_one_open on public.service_alerts (session_id, alert_type) where status <> 'resolved';
create index if not exists service_alerts_restaurant_idx on public.service_alerts (restaurant_id, status, created_at);

-- ---------------------------------------------------------------------------
-- Orders can now belong to a table session (QR at the table) as well as a waitlist ticket.
-- ---------------------------------------------------------------------------
alter table public.orders alter column entry_id drop not null;
alter table public.orders add column if not exists session_id uuid references public.table_sessions (id) on delete set null;
alter table public.orders add column if not exists table_id   uuid references public.restaurant_tables (id) on delete set null;
do $$ begin
  alter table public.orders add constraint orders_owner_chk check (entry_id is not null or session_id is not null);
exception when duplicate_object then null; end $$;
create index if not exists orders_session_idx on public.orders (session_id, round) where session_id is not null;
create index if not exists orders_restaurant_created_idx on public.orders (restaurant_id, created_at);

alter table public.restaurant_tables enable row level security;
alter table public.table_sessions    enable row level security;
alter table public.service_alerts    enable row level security;
grant select, insert, update, delete on public.restaurant_tables, public.table_sessions, public.service_alerts to service_role;
revoke all on public.restaurant_tables, public.table_sessions, public.service_alerts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scan a table QR: join the open session or open a new one. Returns the session.
-- Errors: not_found (wrong table or secret)
-- ---------------------------------------------------------------------------
create or replace function public.tp_scan_table(p_table_id uuid, p_secret text, p_hours int default 8)
returns public.table_sessions
language plpgsql set search_path = public, pg_temp as $$
declare
  v_t public.restaurant_tables;
  v_s public.table_sessions;
begin
  select * into v_t from restaurant_tables where id = p_table_id for update;
  if not found or p_secret is null or length(p_secret) < 32 or v_t.qr_secret <> p_secret then
    raise exception 'not_found';
  end if;
  -- Sessions left open for too long close themselves.
  update table_sessions set closed_at = now()
   where table_id = v_t.id and closed_at is null and opened_at < now() - make_interval(hours => p_hours);
  select * into v_s from table_sessions where table_id = v_t.id and closed_at is null;
  if found then
    return v_s;
  end if;
  insert into table_sessions (restaurant_id, table_id, opened_by) values (v_t.restaurant_id, v_t.id, 'guest')
  returning * into v_s;
  return v_s;
end $$;

-- ---------------------------------------------------------------------------
-- Staff seats a waitlist party at a table: closes the ticket as seated, opens the table session
-- for that party and moves their pre-order onto the table.
-- Errors: not_found, table_busy
-- ---------------------------------------------------------------------------
create or replace function public.tp_seat_at_table(p_restaurant_id uuid, p_entry_id uuid, p_table_id uuid)
returns public.table_sessions
language plpgsql set search_path = public, pg_temp as $$
declare
  v_t public.restaurant_tables;
  v_e public.entries;
  v_s public.table_sessions;
begin
  select * into v_t from restaurant_tables where id = p_table_id and restaurant_id = p_restaurant_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  select * into v_e from entries
   where id = p_entry_id and restaurant_id = p_restaurant_id and status in ('waiting', 'notified', 'seated')
   for update;
  if not found then
    raise exception 'not_found';
  end if;
  if exists (select 1 from table_sessions where table_id = v_t.id and closed_at is null) then
    raise exception 'table_busy';
  end if;

  update entries set status = 'seated', closed_at = coalesce(closed_at, now()), table_label = v_t.table_number
   where id = v_e.id;
  -- A party moved from another table: close that session.
  update table_sessions set closed_at = now() where entry_id = v_e.id and closed_at is null;
  insert into table_sessions (restaurant_id, table_id, entry_id, opened_by)
  values (p_restaurant_id, v_t.id, v_e.id, 'staff')
  returning * into v_s;
  update orders set session_id = v_s.id, table_id = v_t.id
   where entry_id = v_e.id and status <> 'cancelled';
  return v_s;
end $$;

-- ---------------------------------------------------------------------------
-- Order from a table session. Same rules as tp_table_order: prices from the menu, sold-out and
-- off-schedule dishes refused, a round waiting for approval is updated instead of duplicated.
-- Errors: table_closed, too_many_rounds, empty, too_many, item_unavailable
-- ---------------------------------------------------------------------------
create or replace function public.tp_session_order(p_session_id uuid, p_items jsonb, p_note text, p_hours int default 8)
returns public.orders
language plpgsql set search_path = public, pg_temp as $$
declare
  v_s     public.table_sessions;
  v_o     public.orders;
  v_p     record;
  v_round int;
begin
  select * into v_s from table_sessions where id = p_session_id for update;
  if not found or v_s.closed_at is not null or v_s.opened_at < now() - make_interval(hours => p_hours) then
    raise exception 'table_closed';
  end if;

  select * into v_p from public.tp_price_lines(v_s.restaurant_id, p_items);

  select * into v_o from orders
   where session_id = v_s.id and kind = 'table' and status = 'submitted'
   order by round desc limit 1
   for update;
  if found then
    update orders set items = v_p.lines, total = v_p.total, note = left(coalesce(p_note, ''), 200), updated_at = now()
     where id = v_o.id
    returning * into v_o;
    return v_o;
  end if;

  select coalesce(max(round), 0) into v_round from orders where session_id = v_s.id and kind = 'table';
  if v_round >= 30 then
    raise exception 'too_many_rounds';
  end if;
  insert into orders (restaurant_id, entry_id, session_id, table_id, kind, round, status, items, total, note)
  values (v_s.restaurant_id, v_s.entry_id, v_s.id, v_s.table_id, 'table', v_round + 1, 'submitted', v_p.lines, v_p.total, left(coalesce(p_note, ''), 200))
  returning * into v_o;
  return v_o;
end $$;

-- Orders a seated waitlist guest sends from their ticket page also land on their table.
create or replace function public.tp_attach_session() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_s public.table_sessions;
begin
  if new.session_id is null and new.entry_id is not null then
    select * into v_s from table_sessions where entry_id = new.entry_id and closed_at is null limit 1;
    if found then
      new.session_id := v_s.id;
      new.table_id := v_s.table_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_attach_session on public.orders;
create trigger orders_attach_session before insert on public.orders
  for each row execute function public.tp_attach_session();

revoke all on function public.tp_scan_table(uuid, text, int) from public, anon, authenticated;
revoke all on function public.tp_seat_at_table(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.tp_session_order(uuid, jsonb, text, int) from public, anon, authenticated;
revoke all on function public.tp_attach_session() from public, anon, authenticated;
grant execute on function public.tp_scan_table(uuid, text, int) to service_role;
grant execute on function public.tp_seat_at_table(uuid, uuid, uuid) to service_role;
grant execute on function public.tp_session_order(uuid, jsonb, text, int) to service_role;
