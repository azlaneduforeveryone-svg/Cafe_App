-- TablePulse: subscription billing. Run after 0003 (SQL Editor > paste > Run). Safe to re-run.
--
-- How Pro is decided (no scheduled jobs needed):
--   a restaurant is Pro while ANY of these is true
--     * plan = 'pro'            (set by hand: test mode or a free account you give someone)
--     * pro_until  > now()      (paid: each successful payment pushes this to the end of the
--                                paid period plus a few days' grace)
--     * trial_ends_at > now()   (free trial for new restaurants)
--   A failed or cancelled subscription simply stops extending pro_until, so Pro ends on its own
--   at the end of what was paid for.

-- ---------------------------------------------------------------------------
-- Restaurant billing fields
-- ---------------------------------------------------------------------------
alter table public.restaurants add column if not exists pro_until timestamptz;
-- New restaurants get a 14-day Pro trial. (Existing rows also get 14 days from when this runs.)
alter table public.restaurants add column if not exists trial_ends_at timestamptz default (now() + interval '14 days');

create or replace function public.tp_is_pro(r public.restaurants) returns boolean
language sql stable as $$
  select r.plan = 'pro'
      or coalesce(r.pro_until > now(), false)
      or coalesce(r.trial_ends_at > now(), false);
$$;

-- ---------------------------------------------------------------------------
-- Subscriptions (one row per checkout attempt or manual payment arrangement)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants (id) on delete cascade,
  provider            text not null check (provider in ('safepay', 'manual')),
  reference           text not null unique,            -- our own id, made before redirecting
  provider_sub_id     text unique,                     -- Safepay's sub_... once known
  provider_plan_id    text,                            -- Safepay's plan_...
  plan_code           text not null default 'pro_monthly',
  customer_email      text not null default '',
  amount              numeric(12, 2) not null check (amount >= 0),
  currency            text not null,
  status              text not null default 'pending'
                      check (status in ('pending', 'active', 'past_due', 'paused', 'unpaid', 'cancelled', 'ended', 'abandoned')),
  cancel_requested_at timestamptz,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists subscriptions_restaurant_idx on public.subscriptions (restaurant_id, created_at desc);
create index if not exists subscriptions_pending_idx on public.subscriptions (status, created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Invoices from your company to the restaurant, numbered TP-YYYY-00001 without gaps
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_counters (
  year    int primary key,
  last_no int not null
);

create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants (id) on delete restrict,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  number          text not null unique,
  issued_at       timestamptz not null default now(),
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  description     text not null,
  currency        text not null,
  total           numeric(12, 2) not null check (total >= 0),
  tax_rate        numeric(5, 2) not null default 0 check (tax_rate >= 0 and tax_rate < 100),
  tax_label       text not null default '',
  net_amount      numeric(12, 2) not null,
  tax_amount      numeric(12, 2) not null,
  method          text not null,                       -- 'card' (Safepay) or 'bank_transfer' etc.
  provider_txn_id text unique,                         -- Safepay txn_..., or manual_... ; stops double invoices
  buyer           jsonb not null,                      -- snapshot: restaurant name, country, email
  seller          jsonb not null,                      -- snapshot: your company details at the time
  status          text not null default 'paid' check (status in ('paid', 'void')),
  note            text not null default ''
);
create index if not exists invoices_restaurant_idx on public.invoices (restaurant_id, issued_at desc);

-- ---------------------------------------------------------------------------
-- Every webhook received, stored before it is acted on (for retries, audit and manual review)
-- ---------------------------------------------------------------------------
create table if not exists public.billing_events (
  id              text primary key,                    -- provider event token + type (dedupe key)
  provider        text not null,
  type            text not null,
  payload         jsonb not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  result          text,                                -- ok / unmatched / ignored / error / ...
  detail          text not null default '',
  subscription_id uuid references public.subscriptions (id) on delete set null,
  restaurant_id   uuid references public.restaurants (id) on delete set null
);
create index if not exists billing_events_open_idx on public.billing_events (received_at desc) where result is distinct from 'ok';

alter table public.subscriptions    enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.billing_events   enable row level security;
grant select, insert, update, delete on public.subscriptions, public.invoices, public.invoice_counters, public.billing_events to service_role;
revoke all on public.subscriptions, public.invoices, public.invoice_counters, public.billing_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Record one successful payment: invoice + subscription active + Pro extended. All or nothing.
-- Calling it again with the same transaction id returns the existing invoice and changes nothing.
-- ---------------------------------------------------------------------------
create or replace function public.tp_record_payment(
  p_subscription_id uuid,
  p_txn_id          text,
  p_total           numeric,
  p_currency        text,
  p_period_start    timestamptz,
  p_period_end      timestamptz,
  p_method          text,
  p_description     text,
  p_tax_rate        numeric,
  p_tax_label       text,
  p_seller          jsonb,
  p_grace_days      int default 3,
  p_note            text default ''
) returns public.invoices
language plpgsql set search_path = public, pg_temp as $$
declare
  v_inv   public.invoices;
  v_sub   public.subscriptions;
  v_r     public.restaurants;
  v_year  int := extract(year from now() at time zone 'utc')::int;
  v_no    int;
  v_net   numeric(12, 2);
  v_email text;
begin
  if p_txn_id is null or length(p_txn_id) = 0 then
    raise exception 'missing_txn';
  end if;
  if p_total is null or p_total < 0 or p_period_end <= p_period_start then
    raise exception 'bad_amount_or_period';
  end if;

  select * into v_inv from invoices where provider_txn_id = p_txn_id;
  if found then
    return v_inv;                                   -- already recorded (webhook retry)
  end if;

  select * into v_sub from subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'subscription_not_found';
  end if;
  select * into v_r from restaurants where id = v_sub.restaurant_id for update;

  select u.email into v_email
    from staff s join auth.users u on u.id = s.user_id
   where s.restaurant_id = v_r.id and s.role = 'owner'
   order by s.created_at limit 1;

  insert into invoice_counters (year, last_no) values (v_year, 1)
  on conflict (year) do update set last_no = invoice_counters.last_no + 1
  returning last_no into v_no;

  -- Prices are tax-inclusive: split the total into net + tax.
  v_net := round(p_total / (1 + coalesce(p_tax_rate, 0) / 100), 2);

  insert into invoices (
    restaurant_id, subscription_id, number, period_start, period_end, description,
    currency, total, tax_rate, tax_label, net_amount, tax_amount, method, provider_txn_id,
    buyer, seller, note
  ) values (
    v_r.id, v_sub.id, 'TP-' || v_year || '-' || lpad(v_no::text, 5, '0'), p_period_start, p_period_end, p_description,
    p_currency, p_total, coalesce(p_tax_rate, 0), coalesce(p_tax_label, ''), v_net, p_total - v_net, p_method, p_txn_id,
    jsonb_build_object('name', v_r.name, 'slug', v_r.slug, 'country', v_r.country,
                       'email', coalesce(nullif(v_sub.customer_email, ''), v_email, '')),
    coalesce(p_seller, '{}'::jsonb), coalesce(p_note, '')
  ) returning * into v_inv;

  update subscriptions
     set status = 'active', current_period_end = p_period_end, updated_at = now()
   where id = v_sub.id;

  update restaurants
     set pro_until = greatest(coalesce(pro_until, now()), p_period_end + make_interval(days => greatest(p_grace_days, 0)))
   where id = v_r.id;

  return v_inv;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notify: the free monthly limit now applies only when the restaurant is not Pro
-- (paid, trial, or set by hand). Same signature as before, so the app code is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.tp_notify(
  p_restaurant_id uuid, p_entry_id uuid, p_free_limit int
) returns public.entries
language plpgsql set search_path = public, pg_temp as $$
declare
  v_period text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_r public.restaurants;
  v_e public.entries;
  v_pro boolean;
begin
  select * into v_r from restaurants where id = p_restaurant_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  v_pro := public.tp_is_pro(v_r);

  select * into v_e from entries
   where id = p_entry_id and restaurant_id = p_restaurant_id and status in ('waiting', 'notified')
   for update;
  if not found then
    raise exception 'not_found';
  end if;

  if v_e.status = 'waiting' then
    if v_r.alerts_period <> v_period then
      v_r.alerts_used := 0;
    end if;
    if not v_pro and v_r.alerts_used >= p_free_limit then
      raise exception 'limit_reached';
    end if;
    update restaurants
       set alerts_period = v_period,
           alerts_used   = v_r.alerts_used + case when v_pro then 0 else 1 end,
           now_serving   = greatest(now_serving, v_e.ticket_number)
     where id = v_r.id;
    update entries
       set status = 'notified', notified_at = now(), notify_count = notify_count + 1
     where id = v_e.id
    returning * into v_e;
  else
    update entries
       set notified_at = now(), notify_count = notify_count + 1
     where id = v_e.id
    returning * into v_e;
  end if;
  return v_e;
end;
$$;

revoke all on function public.tp_is_pro(public.restaurants) from public, anon, authenticated;
revoke all on function public.tp_record_payment(uuid, text, numeric, text, timestamptz, timestamptz, text, text, numeric, text, jsonb, int, text) from public, anon, authenticated;
revoke all on function public.tp_notify(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.tp_is_pro(public.restaurants) to service_role;
grant execute on function public.tp_record_payment(uuid, text, numeric, text, timestamptz, timestamptz, text, text, numeric, text, jsonb, int, text) to service_role;
grant execute on function public.tp_notify(uuid, uuid, int) to service_role;
