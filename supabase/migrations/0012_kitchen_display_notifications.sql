-- TablePulse: locked kitchen display screens and kitchen → waiter notifications.
-- Run after 0011 (SQL Editor > paste > Run). Safe to re-run. Same security model: server only.
--
-- A kitchen display is a tablet a manager switched into kitchen mode. It holds its own device
-- token (only the hash is stored here) and can do two things: mark dishes ready, mark a dish out
-- of stock. It never holds a staff login. A manager can switch it off from the Staff page.

create table if not exists public.kitchen_devices (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 40),
  token_hash    text not null unique,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists kitchen_devices_restaurant_idx on public.kitchen_devices (restaurant_id, created_at desc);

-- One row per person to tell (the table's waiter, or every waiter when the table has none).
create table if not exists public.staff_notifications (
  id            bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  staff_id      uuid not null references public.staff (user_id) on delete cascade,
  kind          text not null check (kind in ('ready', 'out_of_stock')),
  table_label   text not null default '' check (char_length(table_label) <= 40),
  body          text not null default '' check (char_length(body) <= 200),
  order_id      uuid references public.orders (id) on delete cascade,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
create index if not exists staff_notifications_inbox_idx on public.staff_notifications (staff_id, read_at, created_at desc);
create index if not exists staff_notifications_restaurant_idx on public.staff_notifications (restaurant_id, created_at desc);

alter table public.kitchen_devices     enable row level security;
alter table public.staff_notifications enable row level security;
grant select, insert, update, delete on public.kitchen_devices, public.staff_notifications to service_role;
revoke all on public.kitchen_devices, public.staff_notifications from anon, authenticated;
