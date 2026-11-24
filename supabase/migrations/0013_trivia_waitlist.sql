-- TablePulse: trivia for guests still waiting for a table (on their waitlist ticket).
-- Run after 0012 (SQL Editor > paste > Run). Safe to re-run. Same security model: server only.
--
-- A game now belongs to a table session OR a waiting party (entry), never both. Everyone who
-- opens the party's ticket link can join from their own phone. Same clock, scoring and anti-cheat.

alter table public.trivia_players alter column session_id drop not null;
alter table public.trivia_players add column if not exists entry_id uuid references public.entries (id) on delete cascade;
alter table public.trivia_games   alter column session_id drop not null;
alter table public.trivia_games   add column if not exists entry_id uuid references public.entries (id) on delete cascade;

do $$ begin
  alter table public.trivia_players add constraint trivia_players_owner_chk check (num_nonnulls(session_id, entry_id) = 1);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.trivia_games add constraint trivia_games_owner_chk check (num_nonnulls(session_id, entry_id) = 1);
exception when duplicate_object then null; end $$;
create unique index if not exists trivia_players_entry_nick on public.trivia_players (entry_id, nickname) where entry_id is not null;
create index if not exists trivia_games_entry_idx on public.trivia_games (entry_id, starts_at desc) where entry_id is not null;

-- A party that is still waiting (not seated, gone or a no-show), at a restaurant with trivia on.
create or replace function public.tp_trivia_entry(p_entry_id uuid) returns public.entries
language sql stable set search_path = public, pg_temp as $$
  select e.* from entries e join restaurants r on r.id = e.restaurant_id
   where e.id = p_entry_id and e.status in ('waiting', 'notified') and e.joined_at > now() - interval '12 hours' and r.trivia_on;
$$;

-- Join a waiting party's trivia. Errors: not_found, bad_name, name_taken, table_full
create or replace function public.tp_trivia_join_entry(p_entry_id uuid, p_nickname text)
returns public.trivia_players
language plpgsql set search_path = public, pg_temp as $$
declare
  e  public.entries;
  v  text := left(regexp_replace(trim(coalesce(p_nickname, '')), '\s+', ' ', 'g'), 16);
  p  public.trivia_players;
begin
  select * into e from public.tp_trivia_entry(p_entry_id);
  if e.id is null then raise exception 'not_found'; end if;
  if v = '' or v ~ '[<>{}]' then raise exception 'bad_name'; end if;
  if (select count(*) from trivia_players where entry_id = e.id) >= 8 then raise exception 'table_full'; end if;
  begin
    insert into trivia_players (restaurant_id, entry_id, nickname) values (e.restaurant_id, e.id, v) returning * into p;
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  return p;
end $$;

-- Start a game for a waiting party. Errors: not_found, game_running, too_many_games, no_questions
create or replace function public.tp_trivia_start_entry(p_entry_id uuid, p_player_id uuid)
returns public.trivia_games
language plpgsql set search_path = public, pg_temp as $$
declare
  e    public.entries;
  t    record;
  ids  uuid[];
  g    public.trivia_games;
begin
  select * into e from public.tp_trivia_entry(p_entry_id);
  if e.id is null then raise exception 'not_found'; end if;
  perform 1 from trivia_players where id = p_player_id and entry_id = e.id;
  if not found then raise exception 'not_found'; end if;
  perform 1 from entries where id = e.id for update;
  if exists (select 1 from trivia_games where entry_id = e.id and ends_at > now()) then raise exception 'game_running'; end if;
  if (select count(*) from trivia_games where entry_id = e.id) >= 12 then raise exception 'too_many_games'; end if;
  select * into t from public.tp_trivia_timing();

  with seen as (
    select unnest(question_ids) id from trivia_games where entry_id = e.id
  ), pool as (
    select q.id, (q.id in (select id from seen)) as was_seen, (q.restaurant_id is not null) as house
      from trivia_questions q
     where q.active and (q.restaurant_id is null or q.restaurant_id = e.restaurant_id)
  )
  select array_agg(id) into ids from (
    select id from pool order by was_seen, house desc, random() limit t.questions
  ) x;
  if ids is null or array_length(ids, 1) < 3 then raise exception 'no_questions'; end if;

  insert into trivia_games (restaurant_id, entry_id, question_ids, starts_at, ends_at)
  values (e.restaurant_id, e.id, ids,
          now() + make_interval(secs => t.lead_in),
          now() + make_interval(secs => t.lead_in + array_length(ids, 1) * (t.answer_s + t.reveal_s)))
  returning * into g;
  return g;
end $$;

-- Answering: a player may answer only games of their own table session or waiting party.
create or replace function public.tp_trivia_answer(p_game_id uuid, p_player_id uuid, p_q_index int, p_choice int)
returns public.trivia_answers
language plpgsql set search_path = public, pg_temp as $$
declare
  g        public.trivia_games;
  t        record;
  elapsed  numeric;
  idx      int;
  into_q   numeric;
  q        public.trivia_questions;
  a        public.trivia_answers;
  ok       boolean;
begin
  select * into g from trivia_games where id = p_game_id;
  if not found then raise exception 'not_found'; end if;
  perform 1 from trivia_players p
   where p.id = p_player_id
     and p.session_id is not distinct from g.session_id
     and p.entry_id is not distinct from g.entry_id;
  if not found then raise exception 'not_found'; end if;
  if p_choice is null or p_choice not between 0 and 3 then raise exception 'bad_choice'; end if;
  select * into t from public.tp_trivia_timing();
  elapsed := extract(epoch from (now() - g.starts_at));
  if elapsed < 0 then raise exception 'not_open'; end if;
  idx := floor(elapsed / (t.answer_s + t.reveal_s))::int;
  into_q := elapsed - idx * (t.answer_s + t.reveal_s);
  if idx <> p_q_index or idx >= array_length(g.question_ids, 1) or into_q > t.answer_s then raise exception 'not_open'; end if;
  select * into q from trivia_questions where id = g.question_ids[idx + 1];
  ok := (p_choice = q.correct);
  begin
    insert into trivia_answers (game_id, player_id, q_index, choice, correct, points)
    values (g.id, p_player_id, idx, p_choice, ok,
            case when ok then 500 + round(500 * greatest(0, t.answer_s - into_q) / t.answer_s)::int else 0 end)
    returning * into a;
  exception when unique_violation then
    raise exception 'already_answered';
  end;
  return a;
end $$;

revoke all on function public.tp_trivia_entry(uuid) from public, anon, authenticated;
revoke all on function public.tp_trivia_join_entry(uuid, text) from public, anon, authenticated;
revoke all on function public.tp_trivia_start_entry(uuid, uuid) from public, anon, authenticated;
revoke all on function public.tp_trivia_answer(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.tp_trivia_entry(uuid) to service_role;
grant execute on function public.tp_trivia_join_entry(uuid, text) to service_role;
grant execute on function public.tp_trivia_start_entry(uuid, uuid) to service_role;
grant execute on function public.tp_trivia_answer(uuid, uuid, int, int) to service_role;
