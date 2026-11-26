-- Table & Bell: fixes for the Supabase Security Advisor warnings. Run after 0014. Safe to run twice.

-- 1. Pin search_path on the three small helper functions (they had none set).
alter function public.tp_offset_min(text) set search_path = public, pg_temp;
alter function public.tp_is_pro(public.restaurants) set search_path = public, pg_temp;
alter function public.tp_trivia_timing() set search_path = public, pg_temp;

-- 2. rls_auto_enable() is created by Supabase when "Enable RLS on new tables automatically" is
--    ticked. It is SECURITY DEFINER and was callable through the public API. The event trigger that
--    uses it still works without these grants; nobody should be able to call it over the API.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable' and p.pronargs = 0
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
