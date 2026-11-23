-- TablePulse: the bill (split, tip, payment method), staff marking it paid, receipt and rating.
-- Run after 0007 (SQL Editor > paste > Run). Safe to re-run. Same security model: server only.
--
-- The bill is worked out here from the orders the restaurant accepted, never from the phone.
-- TablePulse records how the guest will pay and when staff confirm payment; it does not take
-- the payment itself. The receipt says it is not a tax invoice.

alter table public.restaurants add column if not exists next_receipt int not null default 1;

create table if not exists public.bills (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_id    uuid references public.table_sessions (id) on delete set null,
  entry_id      uuid references public.entries (id) on delete set null,
  table_id      uuid references public.restaurant_tables (id) on delete set null,
  status        text not null default 'requested' check (status in ('requested', 'paid')),
  subtotal      numeric(12, 2) not null default 0,
  tip_pct       int not null default 0 check (tip_pct between 0 and 30),
  tip_amount    numeric(12, 2) not null default 0,
  total         numeric(12, 2) not null default 0,
  split_ways    int not null default 1 check (split_ways between 1 and 20),
  method        text not null default 'cash',
  receipt_no    int,
  lines         jsonb not null default '[]'::jsonb,   -- snapshot at payment time
  requested_at  timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint bills_owner_chk check (session_id is not null or entry_id is not null),
  constraint bills_method_chk check (method in ('cash', 'card', 'mada', 'apple_pay', 'google_pay', 'stc_pay', 'jazzcash', 'easypaisa', 'raast'))
);
create unique index if not exists bills_one_per_session on public.bills (session_id) where session_id is not null;
create unique index if not exists bills_one_per_entry on public.bills (entry_id) where session_id is null and entry_id is not null;
create index if not exists bills_restaurant_idx on public.bills (restaurant_id, paid_at desc);

create table if not exists public.ratings (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  bill_id       uuid not null unique references public.bills (id) on delete cascade,
  stars         int not null check (stars between 1 and 5),
  comment       text not null default '' check (char_length(comment) <= 300),
  created_at    timestamptz not null default now()
);
create index if not exists ratings_restaurant_idx on public.ratings (restaurant_id, created_at desc);

alter table public.bills   enable row level security;
alter table public.ratings enable row level security;
grant select, insert, update, delete on public.bills, public.ratings to service_role;
revoke all on public.bills, public.ratings from anon, authenticated;

-- Orders of a bill: the session's orders, or the waitlist ticket's when there is no table session.
create or replace function public.tp_bill_orders(p_session_id uuid, p_entry_id uuid)
returns setof public.orders
language sql stable set search_path = public, pg_temp as $$
  select * from orders
   where status = 'accepted'
     and ((p_session_id is not null and session_id = p_session_id)
       or (p_session_id is null and entry_id = p_entry_id));
$$;

-- Lines merged by dish + size + spice, with totals. Used for the bill and the receipt snapshot.
create or replace function public.tp_bill_lines(p_session_id uuid, p_entry_id uuid, out lines jsonb, out subtotal numeric)
language sql stable set search_path = public, pg_temp as $$
  with l as (
    select x->>'id' as id, x->>'nameEn' as en, x->>'nameAr' as ar, x->>'nameUr' as ur,
           (x->>'price')::numeric as price, (x->>'qty')::int as qty,
           x->'portion' as portion, x->>'spice' as spice
      from public.tp_bill_orders(p_session_id, p_entry_id) o, jsonb_array_elements(o.items) x
  ), g as (
    select id, en, ar, ur, price, portion, spice, sum(qty)::int as qty
      from l group by id, en, ar, ur, price, portion, spice
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nameEn', en, 'nameAr', ar, 'nameUr', ur, 'price', price,
                                               'qty', qty, 'portion', portion, 'spice', spice) order by en), '[]'::jsonb),
         coalesce(sum(price * qty), 0)
    from g;
$$;

-- ---------------------------------------------------------------------------
-- Guest asks for the bill (or changes split / tip / method before paying).
-- Errors: not_found, bill_paid, empty_bill, bad_method
-- ---------------------------------------------------------------------------
create or replace function public.tp_request_bill(
  p_session_id uuid, p_entry_id uuid, p_tip_pct int, p_split int, p_method text
) returns public.bills
language plpgsql set search_path = public, pg_temp as $$
declare
  v_rid   uuid;
  v_tid   uuid;
  v_b     public.bills;
  v_lines record;
begin
  if p_session_id is not null then
    select restaurant_id, table_id into v_rid, v_tid from table_sessions where id = p_session_id and closed_at is null;
  else
    select restaurant_id into v_rid from entries where id = p_entry_id and status = 'seated' and table_closed_at is null;
  end if;
  if v_rid is null then
    raise exception 'not_found';
  end if;
  if p_method not in ('cash', 'card', 'mada', 'apple_pay', 'google_pay', 'stc_pay', 'jazzcash', 'easypaisa', 'raast') then
    raise exception 'bad_method';
  end if;

  select * into v_lines from public.tp_bill_lines(p_session_id, p_entry_id);
  if v_lines.subtotal <= 0 then
    raise exception 'empty_bill';
  end if;

  if p_session_id is not null then
    select * into v_b from bills where session_id = p_session_id for update;
  else
    select * into v_b from bills where entry_id = p_entry_id and session_id is null for update;
  end if;
  if found and v_b.status = 'paid' then
    raise exception 'bill_paid';
  end if;

  if found then
    update bills set
      subtotal = v_lines.subtotal,
      tip_pct = greatest(0, least(30, coalesce(p_tip_pct, 0))),
      tip_amount = round(v_lines.subtotal * greatest(0, least(30, coalesce(p_tip_pct, 0))) / 100.0, 2),
      total = v_lines.subtotal + round(v_lines.subtotal * greatest(0, least(30, coalesce(p_tip_pct, 0))) / 100.0, 2),
      split_ways = greatest(1, least(20, coalesce(p_split, 1))),
      method = p_method,
      lines = v_lines.lines,
      requested_at = now()
    where id = v_b.id
    returning * into v_b;
  else
    insert into bills (restaurant_id, session_id, entry_id, table_id, subtotal, tip_pct, tip_amount, total, split_ways, method, lines, requested_at)
    values (
      v_rid, p_session_id, case when p_session_id is null then p_entry_id else (select entry_id from table_sessions where id = p_session_id) end, v_tid,
      v_lines.subtotal,
      greatest(0, least(30, coalesce(p_tip_pct, 0))),
      round(v_lines.subtotal * greatest(0, least(30, coalesce(p_tip_pct, 0))) / 100.0, 2),
      v_lines.subtotal + round(v_lines.subtotal * greatest(0, least(30, coalesce(p_tip_pct, 0))) / 100.0, 2),
      greatest(1, least(20, coalesce(p_split, 1))),
      p_method, v_lines.lines, now()
    )
    returning * into v_b;
  end if;

  -- Tell the floor (one open bill call per table).
  if p_session_id is not null then
    insert into service_alerts (restaurant_id, table_id, session_id, alert_type)
    values (v_rid, v_tid, p_session_id, 'bill')
    on conflict (session_id, alert_type) where status <> 'resolved' do nothing;
  end if;
  return v_b;
end $$;

-- ---------------------------------------------------------------------------
-- Staff confirm payment. Works whether or not the guest asked for the bill first.
-- Gives the receipt a number, freezes the lines, resolves the bill call.
-- Errors: not_found, empty_bill, bad_method
-- ---------------------------------------------------------------------------
create or replace function public.tp_mark_paid(p_restaurant_id uuid, p_session_id uuid, p_entry_id uuid, p_method text)
returns public.bills
language plpgsql set search_path = public, pg_temp as $$
declare
  v_b     public.bills;
  v_lines record;
  v_no    int;
  v_tid   uuid;
begin
  if p_session_id is not null then
    select table_id into v_tid from table_sessions where id = p_session_id and restaurant_id = p_restaurant_id;
    if not found then raise exception 'not_found'; end if;
    select * into v_b from bills where session_id = p_session_id for update;
  else
    perform 1 from entries where id = p_entry_id and restaurant_id = p_restaurant_id;
    if not found then raise exception 'not_found'; end if;
    select * into v_b from bills where entry_id = p_entry_id and session_id is null for update;
  end if;
  if found and v_b.status = 'paid' then
    return v_b;                                   -- already paid: nothing changes
  end if;
  if p_method is not null and p_method not in ('cash', 'card', 'mada', 'apple_pay', 'google_pay', 'stc_pay', 'jazzcash', 'easypaisa', 'raast') then
    raise exception 'bad_method';
  end if;

  select * into v_lines from public.tp_bill_lines(p_session_id, p_entry_id);
  if v_lines.subtotal <= 0 then
    raise exception 'empty_bill';
  end if;

  update restaurants set next_receipt = next_receipt + 1 where id = p_restaurant_id returning next_receipt - 1 into v_no;

  if v_b.id is not null then
    update bills set
      status = 'paid', paid_at = now(), receipt_no = v_no, lines = v_lines.lines,
      subtotal = v_lines.subtotal,
      tip_amount = round(v_lines.subtotal * tip_pct / 100.0, 2),
      total = v_lines.subtotal + round(v_lines.subtotal * tip_pct / 100.0, 2),
      method = coalesce(p_method, method)
    where id = v_b.id
    returning * into v_b;
  else
    insert into bills (restaurant_id, session_id, entry_id, table_id, status, subtotal, total, method, lines, receipt_no, paid_at)
    values (p_restaurant_id, p_session_id,
            case when p_session_id is null then p_entry_id else (select entry_id from table_sessions where id = p_session_id) end,
            v_tid, 'paid', v_lines.subtotal, v_lines.subtotal, coalesce(p_method, 'cash'), v_lines.lines, v_no, now())
    returning * into v_b;
  end if;

  -- Rounds still waiting for approval can't join a paid bill.
  update orders set status = 'cancelled'
   where status = 'submitted'
     and ((p_session_id is not null and session_id = p_session_id)
       or (p_session_id is null and entry_id = p_entry_id and session_id is null));

  if p_session_id is not null then
    update service_alerts set status = 'resolved', resolved_at = now()
     where session_id = p_session_id and alert_type = 'bill' and status <> 'resolved';
  end if;
  return v_b;
end $$;

-- Once the bill is paid, nothing can be added to it: no new round, no edit to a waiting round,
-- and no late approval of a round that was still waiting. Covers table sessions and waitlist tickets.
create or replace function public.tp_block_after_paid() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.items is not distinct from old.items
     and not (new.status = 'accepted' and old.status is distinct from 'accepted') then
    return new;                                   -- served / cancelled / ready updates are fine
  end if;
  if (new.session_id is not null and exists (select 1 from bills where session_id = new.session_id and status = 'paid'))
     or (new.session_id is null and new.entry_id is not null
         and exists (select 1 from bills where entry_id = new.entry_id and session_id is null and status = 'paid')) then
    raise exception 'bill_paid';
  end if;
  return new;
end $$;
drop trigger if exists orders_block_after_paid on public.orders;
create trigger orders_block_after_paid before insert or update of items, status on public.orders
  for each row execute function public.tp_block_after_paid();
-- (tp_attach_session runs first alphabetically: "orders_attach_session" < "orders_block_after_paid")

revoke all on function public.tp_bill_orders(uuid, uuid) from public, anon, authenticated;
revoke all on function public.tp_bill_lines(uuid, uuid) from public, anon, authenticated;
revoke all on function public.tp_request_bill(uuid, uuid, int, int, text) from public, anon, authenticated;
revoke all on function public.tp_mark_paid(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.tp_block_after_paid() from public, anon, authenticated;
grant execute on function public.tp_bill_orders(uuid, uuid) to service_role;
grant execute on function public.tp_bill_lines(uuid, uuid) to service_role;
grant execute on function public.tp_request_bill(uuid, uuid, int, int, text) to service_role;
grant execute on function public.tp_mark_paid(uuid, uuid, uuid, text) to service_role;
