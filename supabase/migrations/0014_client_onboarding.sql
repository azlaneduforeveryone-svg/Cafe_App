-- TablePulse: the platform admin creates a restaurant for a client and sends the owner a one-time link.
-- Run after 0013 (SQL Editor > paste > Run). Safe to run twice.

-- Business details the client gives us. Phone and address show on the guest join page;
-- legal name, CR and VAT numbers stay private (admin and owner only).
alter table public.restaurants add column if not exists legal_name     text not null default '' check (char_length(legal_name) <= 120);
alter table public.restaurants add column if not exists cr_number      text not null default '' check (cr_number ~ '^[A-Za-z0-9-]{0,30}$');
alter table public.restaurants add column if not exists vat_number     text not null default '' check (vat_number ~ '^[A-Za-z0-9-]{0,30}$');
alter table public.restaurants add column if not exists business_phone text not null default '' check (business_phone ~ '^[0-9]{0,15}$');
alter table public.restaurants add column if not exists address        text not null default '' check (char_length(address) <= 200);
alter table public.restaurants add column if not exists city           text not null default '' check (char_length(city) <= 60);
-- Set when the admin created it for a client (null for self sign-up).
alter table public.restaurants add column if not exists onboarded_by   uuid references auth.users (id) on delete set null;

-- Owner invites: the admin's link that makes the client the owner.
alter table public.staff_invites drop constraint if exists staff_invites_role_check;
alter table public.staff_invites add constraint staff_invites_role_check check (role in ('owner', 'manager', 'reception', 'waiter'));

-- ---------------------------------------------------------------------------
-- Create a restaurant with no staff yet. The owner joins through tp_accept_invite.
-- ---------------------------------------------------------------------------
create or replace function public.tp_admin_create_restaurant(
  p_admin_id uuid, p_name text, p_name_ar text, p_name_ur text, p_country text, p_base_slug text, p_details jsonb
) returns public.restaurants
language plpgsql set search_path = public, pg_temp as $$
declare
  v_base text := coalesce(nullif(p_base_slug, ''), 'restaurant');
  v_slug text := v_base;
  v_r public.restaurants;
begin
  while exists (select 1 from restaurants where slug = v_slug) loop
    v_slug := left(v_base, 50) || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into restaurants (slug, name, name_ar, name_ur, country, sections,
                           legal_name, cr_number, vat_number, business_phone, address, city, onboarded_by)
  values (
    v_slug, p_name, coalesce(p_name_ar, ''), coalesce(p_name_ur, ''), p_country,
    '[{"id":"main","en":"Main Hall","ar":"الصالة الرئيسية","ur":"مین ہال"},
      {"id":"family","en":"Family Section","ar":"قسم العائلات","ur":"فیملی سیکشن"}]'::jsonb,
    coalesce(p_details->>'legal_name', ''), coalesce(p_details->>'cr_number', ''),
    coalesce(p_details->>'vat_number', ''), coalesce(p_details->>'business_phone', ''),
    coalesce(p_details->>'address', ''), coalesce(p_details->>'city', ''), p_admin_id
  )
  returning * into v_r;
  return v_r;
end $$;

revoke all on function public.tp_admin_create_restaurant(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.tp_admin_create_restaurant(uuid, text, text, text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Accept an invite. Owner invites: no seat check, only one owner ever, and the
-- 14-day trial starts the day the owner joins (not the day the admin set it up).
-- Errors: invite_invalid, seats_full, already_staff, owner_exists
-- ---------------------------------------------------------------------------
create or replace function public.tp_accept_invite(p_token_hash text, p_user_id uuid, p_phone text)
returns public.staff
language plpgsql set search_path = public, pg_temp as $$
declare
  i     public.staff_invites;
  r     public.restaurants;
  seats int;
  used  int;
  s     public.staff;
begin
  select * into i from staff_invites where token_hash = p_token_hash for update;
  if not found or i.used_at is not null or i.expires_at < now() then raise exception 'invite_invalid'; end if;
  if exists (select 1 from staff where user_id = p_user_id) then raise exception 'already_staff'; end if;
  select * into r from restaurants where id = i.restaurant_id for update;

  if i.role = 'owner' then
    if exists (select 1 from staff where restaurant_id = r.id and role = 'owner') then raise exception 'owner_exists'; end if;
    if r.onboarded_by is not null and r.plan = 'free' and r.pro_until is null then
      update restaurants set trial_ends_at = now() + interval '14 days' where id = r.id;
    end if;
  else
    seats := case when public.tp_is_pro(r) then 20 else 2 end;
    select count(*) into used from staff where restaurant_id = r.id and role <> 'owner';
    if used >= seats then raise exception 'seats_full'; end if;
  end if;

  insert into staff (user_id, restaurant_id, name, role, phone, invited_by)
  values (p_user_id, r.id, i.name, i.role, coalesce(p_phone, ''), i.created_by)
  returning * into s;
  update staff_invites set used_at = now() where id = i.id;
  insert into staff_activity (restaurant_id, staff_id, staff_name, staff_role, action, target)
  values (r.id, p_user_id, i.name, i.role, 'staff_joined', i.name);
  return s;
end $$;

revoke all on function public.tp_accept_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.tp_accept_invite(text, uuid, text) to service_role;
