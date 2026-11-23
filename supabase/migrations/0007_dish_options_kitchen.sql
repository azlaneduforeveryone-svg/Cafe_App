-- TablePulse: dish options (portions, spice, allergens, upsell, kitchen station) and kitchen stages.
-- Run after 0006 (SQL Editor > paste > Run). Safe to re-run. Same security model: server only.
--
-- Order stages (derived from the columns below):
--   submitted                     -> waiting for staff approval
--   accepted, ready_at is null    -> cooking (on the kitchen display)
--   ready_at set                  -> ready to serve (every station marked it ready)
--   served_at set                 -> served

-- Kitchen stations the restaurant cooks at, e.g. [{"id":"tandoor","en":"Tandoor","ar":"التنور","ur":"تندور"}]
alter table public.restaurants add column if not exists stations jsonb not null default '[]'::jsonb;

alter table public.menu_items add column if not exists station        text   not null default '';
alter table public.menu_items add column if not exists allergens      text[] not null default '{}';
-- Spice choices the guest may pick from: any of mild, medium, hot. Empty = no spice choice.
alter table public.menu_items add column if not exists spice_levels   text[] not null default '{}';
-- Sizes with their own price: [{"id":"half","en":"Half","ar":"نصف","ur":"ہاف","price":18}]. Empty = one size at `price`.
alter table public.menu_items add column if not exists portions       jsonb  not null default '[]'::jsonb;
-- "Make it a combo": another dish offered with this one.
alter table public.menu_items add column if not exists upsell_item_id uuid references public.menu_items (id) on delete set null;

do $$ begin
  alter table public.menu_items add constraint menu_items_spice_chk check (spice_levels <@ array['mild', 'medium', 'hot']::text[]);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.menu_items add constraint menu_items_allergens_chk
    check (allergens <@ array['dairy', 'nuts', 'gluten', 'egg', 'seafood', 'soy', 'sesame']::text[]);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.menu_items add constraint menu_items_portions_chk check (jsonb_typeof(portions) = 'array' and jsonb_array_length(portions) <= 4);
exception when duplicate_object then null; end $$;

alter table public.orders add column if not exists accepted_at   timestamptz;
alter table public.orders add column if not exists ready_at      timestamptz;
alter table public.orders add column if not exists served_at     timestamptz;
-- Stations that finished their part: {"tandoor": "2026-11-23T10:00:00Z", ...}
alter table public.orders add column if not exists station_ready jsonb not null default '{}'::jsonb;
create index if not exists orders_kitchen_idx on public.orders (restaurant_id, status, ready_at) where status = 'accepted';

-- ---------------------------------------------------------------------------
-- Price a cart with options. p_items: [{"id": uuid, "qty": 2, "portion": "half", "spice": "hot"}]
--   * dishes with sizes need a valid portion; dishes without sizes must not send one
--   * spice must be one the dish offers (or left out)
--   * the same dish with different options is a separate line
-- Errors: empty, too_many, item_unavailable
-- ---------------------------------------------------------------------------
create or replace function public.tp_price_lines(p_restaurant_id uuid, p_items jsonb, out lines jsonb, out total numeric)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_found  int;
  v_wanted int;
begin
  with req as (
    select (x->>'id')::uuid as id,
           greatest(1, least(20, coalesce((x->>'qty')::int, 1))) as qty,
           nullif(x->>'portion', '') as portion,
           nullif(x->>'spice', '') as spice
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
  )
  select count(*) into v_wanted from (select distinct id, portion, spice from req) d;
  if v_wanted = 0 then
    raise exception 'empty';
  end if;
  if v_wanted > 50 then
    raise exception 'too_many';
  end if;

  with req as (
    select (x->>'id')::uuid as id,
           greatest(1, least(20, coalesce((x->>'qty')::int, 1))) as qty,
           nullif(x->>'portion', '') as portion,
           nullif(x->>'spice', '') as spice
      from jsonb_array_elements(p_items) x
  ), agg as (
    select id, portion, spice, least(20, sum(qty))::int as qty from req group by id, portion, spice
  ), ok as (
    select s.id from public.tp_menu_status(p_restaurant_id) s where s.in_stock and s.on_schedule
  ), l as (
    select a.id, a.qty, a.spice, m.name_en, m.name_ar, m.name_ur, m.station, m.sort, m.created_at,
           p.obj as portion_obj,
           coalesce((p.obj->>'price')::numeric, m.price) as unit_price
      from agg a
      join menu_items m on m.id = a.id and m.restaurant_id = p_restaurant_id
      join ok on ok.id = m.id
      left join lateral (
        select x as obj from jsonb_array_elements(m.portions) x where x->>'id' = a.portion limit 1
      ) p on true
     where ((jsonb_array_length(m.portions) = 0 and a.portion is null) or p.obj is not null)
       and (a.spice is null or a.spice = any(m.spice_levels))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'qty', qty, 'nameEn', name_en, 'nameAr', name_ar, 'nameUr', name_ur, 'price', unit_price,
           'station', station, 'spice', spice,
           'portion', case when portion_obj is null then null
                           else jsonb_build_object('id', portion_obj->>'id', 'en', portion_obj->>'en', 'ar', portion_obj->>'ar', 'ur', portion_obj->>'ur') end
         ) order by sort, created_at), '[]'::jsonb),
         coalesce(sum(unit_price * qty), 0),
         count(*)
    into lines, total, v_found
    from l;

  if v_found <> v_wanted then
    raise exception 'item_unavailable';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Kitchen: a station marks its part of an order ready. When every station on the order is done,
-- the order is ready. Returns the order. Errors: not_found
-- ---------------------------------------------------------------------------
create or replace function public.tp_station_ready(p_restaurant_id uuid, p_order_id uuid, p_station text)
returns public.orders
language plpgsql set search_path = public, pg_temp as $$
declare
  v_o       public.orders;
  v_needed  text[];
  v_done    jsonb;
begin
  select * into v_o from orders where id = p_order_id and restaurant_id = p_restaurant_id and status = 'accepted' for update;
  if not found then
    raise exception 'not_found';
  end if;
  select coalesce(array_agg(distinct coalesce(x->>'station', '')), '{}') into v_needed from jsonb_array_elements(v_o.items) x;
  v_done := v_o.station_ready || jsonb_build_object(coalesce(p_station, ''), now());
  update orders
     set station_ready = v_done,
         ready_at = case when (select bool_and(v_done ? s) from unnest(v_needed) s) then coalesce(ready_at, now()) else ready_at end,
         updated_at = now()
   where id = v_o.id
  returning * into v_o;
  return v_o;
end $$;

revoke all on function public.tp_price_lines(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.tp_station_ready(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.tp_price_lines(uuid, jsonb) to service_role;
grant execute on function public.tp_station_ready(uuid, uuid, text) to service_role;
