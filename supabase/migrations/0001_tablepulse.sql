-- TablePulse database: run once in Supabase (SQL Editor > New query > paste > Run).
-- Safe to re-run: every object is created only if missing, functions are replaced.
--
-- Security model:
--   * Row Level Security is ON for every table and there are NO policies, so the
--     public (anon/publishable) key can read or write nothing.
--   * Only the app's server, using the secret / service_role key, touches data.
--   * The functions below are callable only by service_role.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.restaurants (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  name              text not null check (char_length(name) between 1 and 80),
  name_ar           text not null default '',
  name_ur           text not null default '',
  country           text not null check (country in ('SA', 'PK')),
  sections          jsonb not null default '[]'::jsonb,
  grace_period_min  int  not null default 5 check (grace_period_min between 1 and 30),
  minutes_per_party int  not null default 6 check (minutes_per_party between 1 and 60),
  plan              text not null default 'free' check (plan in ('free', 'pro')),
  alerts_used       int  not null default 0 check (alerts_used >= 0),
  alerts_period     text not null default to_char(now() at time zone 'utc', 'YYYY-MM'),
  next_ticket       int  not null default 1,
  now_serving       int  not null default 0,
  created_at        timestamptz not null default now()
);

-- One row per staff login. user_id is the Supabase Auth user.
create table if not exists public.staff (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null,
  role          text not null default 'owner' check (role in ('owner', 'host')),
  created_at    timestamptz not null default now()
);
create index if not exists staff_restaurant_idx on public.staff (restaurant_id);

create table if not exists public.entries (
  id            uuid primary key default gen_random_uuid(),
  -- The guest's private ticket link. 32 random hex characters.
  token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  ticket_number int  not null,
  name          text not null check (char_length(name) between 1 and 60),
  party_size    int  not null check (party_size between 1 and 30),
  section_id    text not null default '',
  lang          text not null default 'en' check (lang in ('en', 'ar', 'ur')),
  phone         text not null default '',
  source        text not null check (source in ('qr', 'walkin')),
  status        text not null default 'waiting' check (status in ('waiting', 'notified', 'seated', 'no_show', 'left')),
  on_the_way    boolean not null default false,
  joined_at     timestamptz not null default now(),
  notified_at   timestamptz,
  notify_count  int not null default 0,
  closed_at     timestamptz,
  unique (restaurant_id, ticket_number)
);
create index if not exists entries_active_idx on public.entries (restaurant_id, joined_at)
  where status in ('waiting', 'notified');
create index if not exists entries_closed_idx on public.entries (restaurant_id, closed_at)
  where closed_at is not null;

alter table public.restaurants enable row level security;
alter table public.staff       enable row level security;
alter table public.entries     enable row level security;

-- Newer Supabase projects don't give API roles table access automatically.
-- Only the server role gets it; the public roles get nothing (a second lock besides RLS).
grant select, insert, update, delete on public.restaurants, public.staff, public.entries to service_role;
revoke all on public.restaurants, public.staff, public.entries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions (each runs as one transaction, so counters can't race)
-- ---------------------------------------------------------------------------

-- Creates a restaurant and its owner row together. Picks a free slug.
create or replace function public.tp_create_restaurant(
  p_user_id uuid, p_owner_name text, p_restaurant_name text, p_country text, p_base_slug text
) returns public.restaurants
language plpgsql set search_path = public, pg_temp as $$
declare
  v_slug text := coalesce(nullif(p_base_slug, ''), 'restaurant');
  v_r public.restaurants;
begin
  while exists (select 1 from restaurants where slug = v_slug) loop
    v_slug := left(coalesce(nullif(p_base_slug, ''), 'restaurant'), 50) || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into restaurants (slug, name, country, sections)
  values (
    v_slug, p_restaurant_name, p_country,
    '[{"id":"main","en":"Main Hall","ar":"الصالة الرئيسية","ur":"مین ہال"},
      {"id":"family","en":"Family Section","ar":"قسم العائلات","ur":"فیملی سیکشن"}]'::jsonb
  )
  returning * into v_r;

  insert into staff (user_id, restaurant_id, name, role) values (p_user_id, v_r.id, p_owner_name, 'owner');
  return v_r;
end $$;

-- Adds a party to the queue with the next ticket number.
create or replace function public.tp_join(
  p_restaurant_id uuid, p_name text, p_party_size int, p_section_id text,
  p_lang text, p_phone text, p_source text, p_max_active int default 300
) returns public.entries
language plpgsql set search_path = public, pg_temp as $$
declare
  v_ticket int;
  v_active int;
  v_e public.entries;
begin
  -- Locking the restaurant row makes ticket numbers strictly sequential.
  update restaurants set next_ticket = next_ticket + 1
   where id = p_restaurant_id
  returning next_ticket - 1 into v_ticket;
  if v_ticket is null then
    raise exception 'not_found';
  end if;

  select count(*) into v_active from entries
   where restaurant_id = p_restaurant_id and status in ('waiting', 'notified');
  if v_active >= p_max_active then
    raise exception 'queue_full';
  end if;

  insert into entries (restaurant_id, ticket_number, name, party_size, section_id, lang, phone, source)
  values (p_restaurant_id, v_ticket, p_name, p_party_size, p_section_id, p_lang, p_phone, p_source)
  returning * into v_e;
  return v_e;
end $$;

-- Buzzes a party. The first buzz counts against the free plan; buzz again
-- only restarts the countdown. Raises 'limit_reached' when the free plan is used up.
create or replace function public.tp_notify(
  p_restaurant_id uuid, p_entry_id uuid, p_free_limit int
) returns public.entries
language plpgsql set search_path = public, pg_temp as $$
declare
  v_period text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_r public.restaurants;
  v_e public.entries;
begin
  select * into v_r from restaurants where id = p_restaurant_id for update;
  if not found then
    raise exception 'not_found';
  end if;

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
    if v_r.plan = 'free' and v_r.alerts_used >= p_free_limit then
      raise exception 'limit_reached';
    end if;
    update restaurants
       set alerts_period = v_period,
           alerts_used   = v_r.alerts_used + case when v_r.plan = 'free' then 1 else 0 end,
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
end $$;

-- Only the server (service_role) may call these functions.
revoke all on function public.tp_create_restaurant(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.tp_join(uuid, text, int, text, text, text, text, int) from public, anon, authenticated;
revoke all on function public.tp_notify(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.tp_create_restaurant(uuid, text, text, text, text) to service_role;
grant execute on function public.tp_join(uuid, text, int, text, text, text, text, int) to service_role;
grant execute on function public.tp_notify(uuid, uuid, int) to service_role;
