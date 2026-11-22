-- TablePulse: menu, deals, pre-orders and logos. Run after 0001 (SQL Editor > paste > Run).
-- Safe to re-run. Same security model as 0001: RLS on, no policies, server-only access.

-- ---------------------------------------------------------------------------
-- Logo
-- ---------------------------------------------------------------------------
alter table public.restaurants add column if not exists logo_path text;

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
create table if not exists public.menu_categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name_en       text not null check (char_length(name_en) between 1 and 40),
  name_ar       text not null check (char_length(name_ar) between 1 and 40),
  name_ur       text not null check (char_length(name_ur) between 1 and 40),
  sort          int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists menu_categories_restaurant_idx on public.menu_categories (restaurant_id, sort);

create table if not exists public.menu_items (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants (id) on delete cascade,
  category_id      uuid references public.menu_categories (id) on delete set null,
  name_en          text not null check (char_length(name_en) between 1 and 80),
  name_ar          text not null check (char_length(name_ar) between 1 and 80),
  name_ur          text not null check (char_length(name_ur) between 1 and 80),
  desc_en          text not null check (char_length(desc_en) between 1 and 300),
  desc_ar          text not null check (char_length(desc_ar) between 1 and 300),
  desc_ur          text not null check (char_length(desc_ur) between 1 and 300),
  price            numeric(10, 2) not null check (price >= 0 and price < 10000000),
  -- Original price, shown crossed out (deals and discounts). Must be higher than price.
  compare_at_price numeric(10, 2) check (compare_at_price is null or compare_at_price > price),
  is_deal          boolean not null default false,
  image_path       text,
  available        boolean not null default true,
  sort             int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists menu_items_restaurant_idx on public.menu_items (restaurant_id, sort, created_at);

-- ---------------------------------------------------------------------------
-- Pre-orders: at most one per ticket.
--   submitted: guest sent it, guest may still edit or cancel
--   accepted:  host confirmed it, locked
--   cancelled: guest or host cancelled, or guest left / no-show before acceptance
-- items is a snapshot (names and prices at the time of ordering).
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  entry_id      uuid not null unique references public.entries (id) on delete cascade,
  status        text not null default 'submitted' check (status in ('submitted', 'accepted', 'cancelled')),
  items         jsonb not null default '[]'::jsonb,
  total         numeric(12, 2) not null default 0,
  note          text not null default '' check (char_length(note) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists orders_restaurant_idx on public.orders (restaurant_id, status);

alter table public.menu_categories enable row level security;
alter table public.menu_items      enable row level security;
alter table public.orders          enable row level security;

grant select, insert, update, delete on public.menu_categories, public.menu_items, public.orders to service_role;
revoke all on public.menu_categories, public.menu_items, public.orders from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Save (create or replace) a guest's pre-order. Prices come from the menu,
-- never from the guest. p_items: [{"id": "<menu item uuid>", "qty": 2}, ...]
-- Errors: not_active, order_locked, empty, too_many, item_unavailable
-- ---------------------------------------------------------------------------
create or replace function public.tp_save_order(p_entry_id uuid, p_items jsonb, p_note text)
returns public.orders
language plpgsql set search_path = public, pg_temp as $$
declare
  v_e public.entries;
  v_o public.orders;
  v_lines jsonb;
  v_total numeric;
  v_found int;
  v_wanted int;
begin
  select * into v_e from entries where id = p_entry_id for update;
  if not found or v_e.status not in ('waiting', 'notified') then
    raise exception 'not_active';
  end if;

  select * into v_o from orders where entry_id = p_entry_id for update;
  if found and v_o.status = 'accepted' then
    raise exception 'order_locked';
  end if;

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
  ), lines as (
    select a.id, a.qty, m.name_en, m.name_ar, m.name_ur, m.price, m.sort, m.created_at
    from agg a
    join menu_items m on m.id = a.id and m.restaurant_id = v_e.restaurant_id and m.available
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'qty', qty, 'nameEn', name_en, 'nameAr', name_ar, 'nameUr', name_ur, 'price', price
    ) order by sort, created_at), '[]'::jsonb),
    coalesce(sum(price * qty), 0),
    count(*)
  into v_lines, v_total, v_found
  from lines;

  if v_found <> v_wanted then
    raise exception 'item_unavailable';
  end if;

  insert into orders (restaurant_id, entry_id, status, items, total, note)
  values (v_e.restaurant_id, p_entry_id, 'submitted', v_lines, v_total, left(coalesce(p_note, ''), 200))
  on conflict (entry_id) do update
    set status = 'submitted', items = excluded.items, total = excluded.total,
        note = excluded.note, updated_at = now()
  returning * into v_o;
  return v_o;
end $$;

revoke all on function public.tp_save_order(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.tp_save_order(uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Image storage: public read (menu photos and logos are meant to be seen),
-- uploads only through the app's server. 2 MB limit, images only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('restaurant-media', 'restaurant-media', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];
