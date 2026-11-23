-- TablePulse: menu availability (sold out, days, meal times) and ordering at the table.
-- Run after 0004 (SQL Editor > paste > Run). Safe to re-run.
--
-- A dish can be ordered right now when ALL of these hold:
--   * in stock:   available = true, or it was marked sold out "until tomorrow" and that time has passed
--   * its days:   today is one of its days (a business day runs 4:00 AM to 3:59 AM local time)
--   * its times:  if it is tied to meal times (e.g. Lunch 12:00-16:00), it is inside one of them now
--   * its category's days and meal times allow it too
-- Meal times may cross midnight (Dinner 18:00-01:00 counts for the day it started).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
-- Days as a bitmask: Mon 1, Tue 2, Wed 4, Thu 8, Fri 16, Sat 32, Sun 64. 127 = every day.
alter table public.menu_items      add column if not exists back_at timestamptz;
alter table public.menu_items      add column if not exists days    int    not null default 127;
alter table public.menu_items      add column if not exists periods text[] not null default '{}';
alter table public.menu_categories add column if not exists days    int    not null default 127;
alter table public.menu_categories add column if not exists periods text[] not null default '{}';
-- [{ "id": "lunch", "en": "Lunch", "ar": "الغداء", "ur": "دوپہر کا کھانا", "start": "12:00", "end": "16:00" }]
alter table public.restaurants     add column if not exists meal_periods jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.menu_items add constraint menu_items_days_chk check (days between 0 and 127);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.menu_categories add constraint menu_categories_days_chk check (days between 0 and 127);
exception when duplicate_object then null; end $$;

-- Table service: the host may write a table number; the table closes when the host closes it
-- or 6 hours after seating.
alter table public.entries add column if not exists table_label     text not null default '';
alter table public.entries add column if not exists table_closed_at timestamptz;
do $$ begin
  alter table public.entries add constraint entries_table_label_chk check (char_length(table_label) <= 12);
exception when duplicate_object then null; end $$;

-- Orders: a ticket now has at most one pre-order (kind 'pre', while waiting) and any number of
-- table orders (kind 'table', one per round after being seated).
alter table public.orders add column if not exists kind  text not null default 'pre';
alter table public.orders add column if not exists round int  not null default 0;
do $$ begin
  alter table public.orders add constraint orders_kind_chk check (kind in ('pre', 'table'));
exception when duplicate_object then null; end $$;
alter table public.orders drop constraint if exists orders_entry_id_key;
create unique index if not exists orders_one_pre_per_entry on public.orders (entry_id) where kind = 'pre';
create index if not exists orders_entry_idx on public.orders (entry_id, kind, round);

-- ---------------------------------------------------------------------------
-- Schedule check
-- ---------------------------------------------------------------------------
create or replace function public.tp_offset_min(p_country text) returns int
language sql immutable as $$ select case when p_country = 'SA' then 180 else 300 end $$;

create or replace function public.tp_on_schedule(
  p_days int, p_periods text[], p_meal jsonb, p_offset int, p_at timestamptz default now()
) returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_local timestamp := (p_at at time zone 'utc') + make_interval(mins => p_offset);
  v_meal  jsonb := case when jsonb_typeof(p_meal) = 'array' then p_meal else '[]'::jsonb end;
  v_p     jsonb;
  v_s     int;
  v_e     int;
  v_d     date;
  v_from  timestamp;
  v_to    timestamp;
  v_any   boolean := false;
begin
  if coalesce(p_days, 127) & 127 = 0 then
    return false;
  end if;

  for v_p in select x from jsonb_array_elements(v_meal) x where x->>'id' = any(coalesce(p_periods, '{}')) loop
    begin
      v_s := split_part(v_p->>'start', ':', 1)::int * 60 + split_part(v_p->>'start', ':', 2)::int;
      v_e := split_part(v_p->>'end', ':', 1)::int * 60 + split_part(v_p->>'end', ':', 2)::int;
    exception when others then
      continue;                                       -- a malformed time never blocks the menu
    end;
    v_any := true;
    foreach v_d in array array[v_local::date, v_local::date - 1] loop
      v_from := v_d + make_interval(mins => v_s);
      v_to   := v_d + make_interval(mins => v_e) + case when v_e <= v_s then interval '1 day' else interval '0' end;
      if v_local >= v_from and v_local < v_to and (p_days & (1 << (extract(isodow from v_d)::int - 1))) <> 0 then
        return true;
      end if;
    end loop;
  end loop;

  if v_any then
    return false;                                     -- tied to meal times, none of them is on now
  end if;
  -- No meal times (or they were all deleted): the whole business day counts.
  v_d := (v_local - interval '4 hours')::date;
  return (p_days & (1 << (extract(isodow from v_d)::int - 1))) <> 0;
end $$;

-- Every dish of a restaurant with whether it is in stock and on schedule right now.
create or replace function public.tp_menu_status(p_restaurant_id uuid, p_at timestamptz default now())
returns table (id uuid, in_stock boolean, on_schedule boolean)
language sql stable set search_path = public, pg_temp as $$
  select m.id,
         (m.available or (m.back_at is not null and m.back_at <= p_at)) as in_stock,
         public.tp_on_schedule(m.days, m.periods, r.meal_periods, public.tp_offset_min(r.country), p_at)
           and (c.id is null or public.tp_on_schedule(c.days, c.periods, r.meal_periods, public.tp_offset_min(r.country), p_at)) as on_schedule
    from menu_items m
    join restaurants r on r.id = m.restaurant_id
    left join menu_categories c on c.id = m.category_id
   where m.restaurant_id = p_restaurant_id;
$$;

-- ---------------------------------------------------------------------------
-- Turn a guest's cart into priced lines. Prices always come from the menu.
-- Errors: empty, too_many, item_unavailable (missing, sold out or not on now)
-- ---------------------------------------------------------------------------
create or replace function public.tp_price_lines(p_restaurant_id uuid, p_items jsonb, out lines jsonb, out total numeric)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_found  int;
  v_wanted int;
begin
  select count(distinct x->>'id') into v_wanted from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;
  if v_wanted = 0 then
    raise exception 'empty';
  end if;
  if v_wanted > 50 then
    raise exception 'too_many';
  end if;

  with req as (
    select (x->>'id')::uuid as id, greatest(1, least(20, coalesce((x->>'qty')::int, 1))) as qty
      from jsonb_array_elements(p_items) x
  ), agg as (
    select id, least(20, sum(qty))::int as qty from req group by id
  ), ok as (
    select s.id from public.tp_menu_status(p_restaurant_id) s where s.in_stock and s.on_schedule
  ), l as (
    select a.id, a.qty, m.name_en, m.name_ar, m.name_ur, m.price, m.sort, m.created_at
      from agg a
      join menu_items m on m.id = a.id and m.restaurant_id = p_restaurant_id
      join ok on ok.id = m.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'qty', qty, 'nameEn', name_en, 'nameAr', name_ar, 'nameUr', name_ur, 'price', price
         ) order by sort, created_at), '[]'::jsonb),
         coalesce(sum(price * qty), 0),
         count(*)
    into lines, total, v_found
    from l;

  if v_found <> v_wanted then
    raise exception 'item_unavailable';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Pre-order while waiting (same behaviour as before, now with the availability rules)
-- Errors: not_active, order_locked, empty, too_many, item_unavailable
-- ---------------------------------------------------------------------------
create or replace function public.tp_save_order(p_entry_id uuid, p_items jsonb, p_note text)
returns public.orders
language plpgsql set search_path = public, pg_temp as $$
declare
  v_e public.entries;
  v_o public.orders;
  v_p record;
begin
  select * into v_e from entries where id = p_entry_id for update;
  if not found or v_e.status not in ('waiting', 'notified') then
    raise exception 'not_active';
  end if;

  select * into v_o from orders where entry_id = p_entry_id and kind = 'pre' for update;
  if found and v_o.status = 'accepted' then
    raise exception 'order_locked';
  end if;

  select * into v_p from public.tp_price_lines(v_e.restaurant_id, p_items);

  insert into orders (restaurant_id, entry_id, kind, round, status, items, total, note)
  values (v_e.restaurant_id, p_entry_id, 'pre', 0, 'submitted', v_p.lines, v_p.total, left(coalesce(p_note, ''), 200))
  on conflict (entry_id) where kind = 'pre' do update
    set status = 'submitted', items = excluded.items, total = excluded.total,
        note = excluded.note, updated_at = now()
  returning * into v_o;
  return v_o;
end $$;

-- ---------------------------------------------------------------------------
-- Order at the table after being seated. Each accepted order is a "round"; while a round is
-- still waiting for the restaurant, sending again replaces it instead of adding another.
-- Errors: table_closed, too_many_rounds, empty, too_many, item_unavailable
-- ---------------------------------------------------------------------------
create or replace function public.tp_table_order(p_entry_id uuid, p_items jsonb, p_note text, p_hours int default 6)
returns public.orders
language plpgsql set search_path = public, pg_temp as $$
declare
  v_e     public.entries;
  v_o     public.orders;
  v_p     record;
  v_round int;
begin
  select * into v_e from entries where id = p_entry_id for update;
  if not found or v_e.status <> 'seated' or v_e.table_closed_at is not null
     or v_e.closed_at is null or v_e.closed_at < now() - make_interval(hours => p_hours) then
    raise exception 'table_closed';
  end if;

  select * into v_p from public.tp_price_lines(v_e.restaurant_id, p_items);

  select * into v_o from orders
   where entry_id = p_entry_id and kind = 'table' and status = 'submitted'
   order by round desc limit 1
   for update;
  if found then
    update orders set items = v_p.lines, total = v_p.total, note = left(coalesce(p_note, ''), 200), updated_at = now()
     where id = v_o.id
    returning * into v_o;
    return v_o;
  end if;

  select coalesce(max(round), 0) into v_round from orders where entry_id = p_entry_id and kind = 'table';
  if v_round >= 30 then
    raise exception 'too_many_rounds';
  end if;
  insert into orders (restaurant_id, entry_id, kind, round, status, items, total, note)
  values (v_e.restaurant_id, p_entry_id, 'table', v_round + 1, 'submitted', v_p.lines, v_p.total, left(coalesce(p_note, ''), 200))
  returning * into v_o;
  return v_o;
end $$;

revoke all on function public.tp_offset_min(text) from public, anon, authenticated;
revoke all on function public.tp_on_schedule(int, text[], jsonb, int, timestamptz) from public, anon, authenticated;
revoke all on function public.tp_menu_status(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.tp_price_lines(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.tp_save_order(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.tp_table_order(uuid, jsonb, text, int) from public, anon, authenticated;
grant execute on function public.tp_offset_min(text) to service_role;
grant execute on function public.tp_on_schedule(int, text[], jsonb, int, timestamptz) to service_role;
grant execute on function public.tp_menu_status(uuid, timestamptz) to service_role;
grant execute on function public.tp_price_lines(uuid, jsonb) to service_role;
grant execute on function public.tp_save_order(uuid, jsonb, text) to service_role;
grant execute on function public.tp_table_order(uuid, jsonb, text, int) to service_role;
