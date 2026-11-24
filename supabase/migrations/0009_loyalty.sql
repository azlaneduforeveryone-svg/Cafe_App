-- TablePulse: loyalty by phone number, stamps or points (the owner picks), confirmed by staff.
-- Run after 0008 (SQL Editor > paste > Run). Safe to re-run. Same security model: server only.
--
-- Guests can type any phone number, so the system never trusts the phone on its own:
--   * stamps / points are added only when staff mark a bill paid (one earn per bill, max 3 a day per member);
--   * rewards are spent only by staff, who see the member's name before confirming;
--   * guests never look up a balance by number; they see it only on their own paid receipt.
-- Loyalty is a Pro feature: nothing is earned while the restaurant isn't Pro.

alter table public.restaurants
  add column if not exists loyalty_mode      text not null default 'off',
  add column if not exists stamps_needed     int not null default 8,
  add column if not exists stamp_min_spend   numeric(12, 2) not null default 0,
  add column if not exists spend_per_point   numeric(12, 2) not null default 10;
do $$ begin
  alter table public.restaurants add constraint restaurants_loyalty_mode_chk check (loyalty_mode in ('off', 'stamps', 'points'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.restaurants add constraint restaurants_loyalty_nums_chk
    check (stamps_needed between 3 and 20 and stamp_min_spend >= 0 and spend_per_point > 0);
exception when duplicate_object then null; end $$;

alter table public.bills add column if not exists loyalty_phone text;

create table if not exists public.loyalty_members (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  phone          text not null check (phone ~ '^[0-9]{8,15}$'),     -- digits only, with country code
  name           text not null default '' check (char_length(name) <= 60),
  stamps         int not null default 0 check (stamps >= 0),
  points         int not null default 0 check (points >= 0),
  visits         int not null default 0,
  created_at     timestamptz not null default now(),
  last_visit_at  timestamptz,
  unique (restaurant_id, phone)
);

create table if not exists public.loyalty_rewards (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  kind           text not null check (kind in ('stamps', 'points')),
  name_en        text not null check (char_length(name_en) between 1 and 60),
  name_ar        text not null default '' check (char_length(name_ar) <= 60),
  name_ur        text not null default '' check (char_length(name_ur) <= 60),
  cost           int not null check (cost between 1 and 100000),
  active         boolean not null default true,
  sort           int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists loyalty_rewards_restaurant_idx on public.loyalty_rewards (restaurant_id, kind, sort);

create table if not exists public.loyalty_events (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  member_id      uuid not null references public.loyalty_members (id) on delete cascade,
  bill_id        uuid references public.bills (id) on delete set null,
  kind           text not null check (kind in ('earn', 'redeem')),
  stamps         int not null default 0,
  points         int not null default 0,
  reward_id      uuid references public.loyalty_rewards (id) on delete set null,
  reward_name    text not null default '',
  created_at     timestamptz not null default now()
);
create unique index if not exists loyalty_events_one_earn_per_bill on public.loyalty_events (bill_id) where kind = 'earn' and bill_id is not null;
create index if not exists loyalty_events_member_idx on public.loyalty_events (member_id, created_at desc);
create index if not exists loyalty_events_restaurant_idx on public.loyalty_events (restaurant_id, created_at desc);

alter table public.loyalty_members enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_events  enable row level security;
grant select, insert, update, delete on public.loyalty_members, public.loyalty_rewards, public.loyalty_events to service_role;
revoke all on public.loyalty_members, public.loyalty_rewards, public.loyalty_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Phone numbers: digits only with country code. Local SA (05..) and PK (03..) numbers
-- get their code; numbers typed with + or 00 keep theirs. Returns null when invalid.
-- ---------------------------------------------------------------------------
create or replace function public.tp_norm_phone(p_country text, p_raw text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v text := coalesce(p_raw, '');
  intl boolean := v ~ '^\s*(\+|00)';
begin
  v := translate(v, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');   -- Arabic / Urdu digits
  v := regexp_replace(v, '[^0-9]', '', 'g');
  if intl then
    v := regexp_replace(v, '^00', '');
  elsif p_country = 'SA' and v ~ '^05[0-9]{8}$' then v := '966' || substr(v, 2);
  elsif p_country = 'SA' and v ~ '^5[0-9]{8}$'  then v := '966' || v;
  elsif p_country = 'PK' and v ~ '^03[0-9]{9}$' then v := '92' || substr(v, 2);
  elsif p_country = 'PK' and v ~ '^3[0-9]{9}$'  then v := '92' || v;
  elsif not (v ~ '^(966|92)') then
    return null;
  end if;
  if v ~ '^966' and v !~ '^9665[0-9]{8}$' then return null; end if;
  if v ~ '^92'  and v !~ '^923[0-9]{9}$'  then return null; end if;
  if v !~ '^[1-9][0-9]{7,14}$' then return null; end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Earn for a paid bill. Staff-only path (called right after tp_mark_paid).
-- p_phone overrides the number the guest typed. Returns the member (or null when
-- loyalty is off / not Pro / no phone). Errors: bad_phone, not_paid, earn_limit
-- ---------------------------------------------------------------------------
create or replace function public.tp_loyalty_earn(p_restaurant_id uuid, p_bill_id uuid, p_phone text, p_name text)
returns public.loyalty_members
language plpgsql set search_path = public, pg_temp as $$
declare
  r       public.restaurants;
  b       public.bills;
  m       public.loyalty_members;
  v_phone text;
  v_st    int := 0;
  v_pt    int := 0;
begin
  select * into r from restaurants where id = p_restaurant_id;
  if not found or r.loyalty_mode = 'off' or not public.tp_is_pro(r) then
    return null;
  end if;
  select * into b from bills where id = p_bill_id and restaurant_id = p_restaurant_id;
  if not found or b.status <> 'paid' then
    raise exception 'not_paid';
  end if;
  if nullif(trim(coalesce(p_phone, '')), '') is null and b.loyalty_phone is null then
    return null;
  end if;
  v_phone := public.tp_norm_phone(r.country, coalesce(nullif(trim(coalesce(p_phone, '')), ''), b.loyalty_phone));
  if v_phone is null then
    raise exception 'bad_phone';
  end if;

  -- Already earned on this bill: return the member as it is now.
  select m2.* into m from loyalty_events e join loyalty_members m2 on m2.id = e.member_id
   where e.bill_id = b.id and e.kind = 'earn';
  if found then return m; end if;

  insert into loyalty_members (restaurant_id, phone, name)
  values (p_restaurant_id, v_phone, left(trim(coalesce(p_name, '')), 60))
  on conflict (restaurant_id, phone) do update
    set name = case when loyalty_members.name = '' then excluded.name else loyalty_members.name end
  returning * into m;
  select * into m from loyalty_members where id = m.id for update;

  if (select count(*) from loyalty_events where member_id = m.id and kind = 'earn' and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'earn_limit';
  end if;

  if r.loyalty_mode = 'stamps' then
    v_st := case when b.subtotal >= r.stamp_min_spend then 1 else 0 end;
  else
    v_pt := floor(b.subtotal / r.spend_per_point)::int;
  end if;

  update loyalty_members set stamps = stamps + v_st, points = points + v_pt, visits = visits + 1, last_visit_at = now()
   where id = m.id returning * into m;
  insert into loyalty_events (restaurant_id, member_id, bill_id, kind, stamps, points)
  values (p_restaurant_id, m.id, b.id, 'earn', v_st, v_pt);
  update bills set loyalty_phone = v_phone where id = b.id;
  return m;
end $$;

-- ---------------------------------------------------------------------------
-- Spend a reward. Staff-only. Errors: not_found, reward_off, not_enough
-- ---------------------------------------------------------------------------
create or replace function public.tp_loyalty_redeem(p_restaurant_id uuid, p_member_id uuid, p_reward_id uuid, p_bill_id uuid)
returns public.loyalty_members
language plpgsql set search_path = public, pg_temp as $$
declare
  r  public.restaurants;
  m  public.loyalty_members;
  w  public.loyalty_rewards;
begin
  select * into r from restaurants where id = p_restaurant_id;
  select * into m from loyalty_members where id = p_member_id and restaurant_id = p_restaurant_id for update;
  if not found then raise exception 'not_found'; end if;
  select * into w from loyalty_rewards where id = p_reward_id and restaurant_id = p_restaurant_id;
  if not found then raise exception 'not_found'; end if;
  if not w.active or w.kind <> r.loyalty_mode or not public.tp_is_pro(r) then
    raise exception 'reward_off';
  end if;
  if (w.kind = 'stamps' and m.stamps < w.cost) or (w.kind = 'points' and m.points < w.cost) then
    raise exception 'not_enough';
  end if;
  update loyalty_members
     set stamps = stamps - case when w.kind = 'stamps' then w.cost else 0 end,
         points = points - case when w.kind = 'points' then w.cost else 0 end
   where id = m.id returning * into m;
  insert into loyalty_events (restaurant_id, member_id, bill_id, kind, stamps, points, reward_id, reward_name)
  values (p_restaurant_id, m.id,
          (select id from bills where id = p_bill_id and restaurant_id = p_restaurant_id),
          'redeem',
          case when w.kind = 'stamps' then -w.cost else 0 end,
          case when w.kind = 'points' then -w.cost else 0 end,
          w.id, w.name_en);
  return m;
end $$;

revoke all on function public.tp_norm_phone(text, text) from public, anon, authenticated;
revoke all on function public.tp_loyalty_earn(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.tp_loyalty_redeem(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.tp_norm_phone(text, text) to service_role;
grant execute on function public.tp_loyalty_earn(uuid, uuid, text, text) to service_role;
grant execute on function public.tp_loyalty_redeem(uuid, uuid, uuid, uuid) to service_role;
