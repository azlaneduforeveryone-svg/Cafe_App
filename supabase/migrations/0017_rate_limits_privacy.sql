-- Phase 8a: rate limits, signup consent, and automatic clean-up of guest personal data.
--
-- 1. rate_limits + tp_rate_limit(): a fixed-window counter the server uses to slow down
--    password guessing, fake signups and queue flooding. Keys are hashed on the server
--    (no raw IP addresses or emails are stored here).
-- 2. restaurants.terms_accepted_at: when the owner accepted the Terms and Privacy Policy.
-- 3. tp_purge_guest_data(): removes guest phone numbers after 30 days and guest names after
--    180 days. Loyalty members are kept (the guest chose to join). Scheduled daily with pg_cron.

-- 1. Rate limits ------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key          text primary key check (char_length(key) <= 200),
  window_start timestamptz not null default now(),
  hits         int not null default 1
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Counts one hit for p_key and answers true while the key is within p_max hits per window.
create or replace function public.tp_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits int;
begin
  if p_key is null or p_key = '' or p_window_seconds < 1 or p_max < 1 then
    return true;
  end if;
  insert into public.rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  -- Now and then, drop keys nobody has used for a day.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end;
$$;
revoke execute on function public.tp_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.tp_rate_limit(text, int, int) to service_role;

-- 2. Consent ----------------------------------------------------------------------------
alter table public.restaurants add column if not exists terms_accepted_at timestamptz;

-- 3. Guest data clean-up ----------------------------------------------------------------
create or replace function public.tp_purge_guest_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phones int;
  v_names int;
begin
  update public.entries
     set phone = ''
   where phone <> ''
     and joined_at < now() - interval '30 days'
     and status not in ('waiting', 'notified');
  get diagnostics v_phones = row_count;

  update public.entries
     set name = 'Guest'
   where name <> 'Guest'
     and joined_at < now() - interval '180 days'
     and status not in ('waiting', 'notified');
  get diagnostics v_names = row_count;

  return jsonb_build_object('phones_removed', v_phones, 'names_removed', v_names);
end;
$$;
revoke execute on function public.tp_purge_guest_data() from public, anon, authenticated;
grant execute on function public.tp_purge_guest_data() to service_role;

-- Run it every night at 03:17 UTC. If pg_cron cannot be enabled here, the rest of this
-- migration still applies and the notice explains what to do.
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.unschedule(jobid) from cron.job where jobname = 'tp-purge-guest-data';
  perform cron.schedule('tp-purge-guest-data', '17 3 * * *', 'select public.tp_purge_guest_data()');
exception when others then
  raise notice 'pg_cron not available (%). Enable pg_cron in Supabase > Database > Extensions, then re-run this block.', sqlerrm;
end;
$$;
