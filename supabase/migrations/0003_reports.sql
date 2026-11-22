-- TablePulse: business reports. Run after 0002 (SQL Editor > paste > Run).
-- Safe to re-run. Read-only: adds one index and one report function, changes no data.
--
-- Business day: a day runs from 4:00 AM to 3:59 AM local time, so a party that
-- joins at 1 AM on a busy Thursday night counts as Thursday.
-- All numbers are worked out here in SQL; the app only formats them.

create index if not exists entries_joined_idx on public.entries (restaurant_id, joined_at);

-- p_offset_min: the restaurant's UTC offset in minutes (Saudi Arabia 180, Pakistan 300).
-- Returns:
--   days:  one row per business day that has activity
--   hours: joins and waits by weekday (1 = Monday) and local hour
--   items: pre-ordered dishes per day (accepted orders of seated guests only)
--   names: dish names in three languages, from the order snapshots
create or replace function public.tp_report(
  p_restaurant_id uuid, p_from date, p_to date, p_offset_min int default 180
) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  with e as (
    select
      en.id, en.status, en.party_size, en.source,
      ((en.joined_at at time zone 'utc') + make_interval(mins => p_offset_min - 240))::date as d,
      extract(hour from (en.joined_at at time zone 'utc') + make_interval(mins => p_offset_min))::int as h,
      case when en.status = 'seated'
        then extract(epoch from (coalesce(en.notified_at, en.closed_at) - en.joined_at)) / 60.0
      end as wait_min
    from entries en
    where en.restaurant_id = p_restaurant_id
      and p_to >= p_from and p_to - p_from <= 400
      and en.joined_at >= ((p_from::timestamp + make_interval(mins => 240 - p_offset_min)) at time zone 'utc')
      and en.joined_at <  (((p_to + 1)::timestamp + make_interval(mins => 240 - p_offset_min)) at time zone 'utc')
  ),
  o as (
    select e.d, e.status as entry_status, od.items, od.total
    from e join orders od on od.entry_id = e.id and od.status = 'accepted'
  ),
  q as (
    select d,
      count(*) as joined,
      count(*) filter (where status = 'seated') as seated,
      coalesce(sum(party_size) filter (where status = 'seated'), 0) as covers,
      count(*) filter (where status = 'no_show') as no_show,
      count(*) filter (where status = 'left') as walked,
      count(*) filter (where source = 'qr') as qr,
      count(*) filter (where source = 'walkin') as walkin,
      coalesce(round(sum(wait_min)::numeric, 1), 0) as wait_sum,
      count(wait_min) as wait_n
    from e group by d
  ),
  s as (
    select d,
      count(*) filter (where entry_status = 'seated') as orders,
      coalesce(sum(total) filter (where entry_status = 'seated'), 0) as sales,
      count(*) filter (where entry_status in ('no_show', 'left')) as wasted,
      coalesce(sum(total) filter (where entry_status in ('no_show', 'left')), 0) as wasted_value
    from o group by d
  ),
  lines as (
    select o.d, x
    from o, jsonb_array_elements(o.items) x
    where o.entry_status = 'seated'
  ),
  it as (
    select d, x->>'id' as id,
      sum((x->>'qty')::int) as qty,
      sum((x->>'qty')::int * (x->>'price')::numeric) as revenue
    from lines group by d, x->>'id'
  ),
  nm as (
    select distinct on (x->>'id') x->>'id' as id, x->>'nameEn' as en, x->>'nameAr' as ar, x->>'nameUr' as ur
    from lines order by x->>'id', d desc
  ),
  hr as (
    select extract(isodow from d)::int as dow, h,
      count(*) as joined,
      coalesce(round(sum(wait_min)::numeric, 1), 0) as wait_sum,
      count(wait_min) as wait_n
    from e group by 1, 2
  )
  select jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'd', q.d, 'joined', q.joined, 'seated', q.seated, 'covers', q.covers,
        'noShow', q.no_show, 'walked', q.walked, 'qr', q.qr, 'walkin', q.walkin,
        'waitSum', q.wait_sum, 'waitN', q.wait_n,
        'orders', coalesce(s.orders, 0), 'sales', coalesce(s.sales, 0),
        'wasted', coalesce(s.wasted, 0), 'wastedValue', coalesce(s.wasted_value, 0)
      ) order by q.d)
      from q left join s on s.d = q.d
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('dow', dow, 'h', h, 'joined', joined, 'waitSum', wait_sum, 'waitN', wait_n))
      from hr
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('d', d, 'id', id, 'qty', qty, 'revenue', revenue)) from it
    ), '[]'::jsonb),
    'names', coalesce((
      select jsonb_object_agg(id, jsonb_build_object('en', en, 'ar', ar, 'ur', ur)) from nm
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.tp_report(uuid, date, date, int) from public, anon, authenticated;
grant execute on function public.tp_report(uuid, date, date, int) to service_role;
