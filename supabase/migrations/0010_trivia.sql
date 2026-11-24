-- TablePulse: multiplayer trivia for guests at a table.
-- Run after 0009 (SQL Editor > paste > Run). Safe to re-run. Same security model: server only.
--
-- Everyone at a table plays on their own phone (they all scanned the table QR). The server owns
-- the clock and the answers: a phone only sees the correct answer after the question closes,
-- and points are worked out here from the server's own time. Nicknames stay within the table;
-- the restaurant board shows table labels and scores only. No prizes are tied to scores.

alter table public.restaurants add column if not exists trivia_on boolean not null default true;

create table if not exists public.trivia_questions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants (id) on delete cascade,   -- null = built-in pack
  code          text unique,                                                 -- built-in pack key
  category      text not null default 'general' check (category in ('food', 'geo', 'science', 'general', 'house')),
  q_en          text not null check (char_length(q_en) between 3 and 160),
  q_ar          text not null default '' check (char_length(q_ar) <= 160),
  q_ur          text not null default '' check (char_length(q_ur) <= 160),
  options       jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct       int not null check (correct between 0 and 3),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists trivia_questions_restaurant_idx on public.trivia_questions (restaurant_id, active);

create table if not exists public.trivia_players (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_id    uuid not null references public.table_sessions (id) on delete cascade,
  token         text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  nickname      text not null check (char_length(nickname) between 1 and 16),
  created_at    timestamptz not null default now(),
  unique (session_id, nickname)
);

create table if not exists public.trivia_games (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  session_id    uuid not null references public.table_sessions (id) on delete cascade,
  table_id      uuid references public.restaurant_tables (id) on delete set null,
  question_ids  uuid[] not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  created_at    timestamptz not null default now()
);
create index if not exists trivia_games_session_idx on public.trivia_games (session_id, starts_at desc);
create index if not exists trivia_games_restaurant_idx on public.trivia_games (restaurant_id, starts_at desc);

create table if not exists public.trivia_answers (
  game_id       uuid not null references public.trivia_games (id) on delete cascade,
  player_id     uuid not null references public.trivia_players (id) on delete cascade,
  q_index       int not null check (q_index between 0 and 19),
  choice        int not null check (choice between 0 and 3),
  correct       boolean not null,
  points        int not null default 0,
  answered_at   timestamptz not null default now(),
  primary key (game_id, player_id, q_index)
);

alter table public.trivia_questions enable row level security;
alter table public.trivia_players   enable row level security;
alter table public.trivia_games     enable row level security;
alter table public.trivia_answers   enable row level security;
grant select, insert, update, delete on public.trivia_questions, public.trivia_players, public.trivia_games, public.trivia_answers to service_role;
revoke all on public.trivia_questions, public.trivia_players, public.trivia_games, public.trivia_answers from anon, authenticated;

-- Timing (seconds). Kept in one place so SQL and the app agree.
create or replace function public.tp_trivia_timing(out lead_in int, out answer_s int, out reveal_s int, out questions int)
language sql immutable as $$ select 5, 15, 5, 8 $$;

-- Live session check used by trivia (open and less than 8 hours old).
create or replace function public.tp_trivia_session(p_session_id uuid) returns public.table_sessions
language sql stable set search_path = public, pg_temp as $$
  select s.* from table_sessions s join restaurants r on r.id = s.restaurant_id
   where s.id = p_session_id and s.closed_at is null and s.opened_at > now() - interval '8 hours' and r.trivia_on;
$$;

-- ---------------------------------------------------------------------------
-- Join the table's trivia with a nickname. Errors: not_found, bad_name, name_taken, table_full
-- ---------------------------------------------------------------------------
create or replace function public.tp_trivia_join(p_session_id uuid, p_nickname text)
returns public.trivia_players
language plpgsql set search_path = public, pg_temp as $$
declare
  s    public.table_sessions;
  v    text := left(regexp_replace(trim(coalesce(p_nickname, '')), '\s+', ' ', 'g'), 16);
  p    public.trivia_players;
begin
  select * into s from public.tp_trivia_session(p_session_id);
  if s.id is null then raise exception 'not_found'; end if;
  if v = '' or v ~ '[<>{}]' then raise exception 'bad_name'; end if;
  if (select count(*) from trivia_players where session_id = s.id) >= 8 then raise exception 'table_full'; end if;
  begin
    insert into trivia_players (restaurant_id, session_id, nickname) values (s.restaurant_id, s.id, v) returning * into p;
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  return p;
end $$;

-- ---------------------------------------------------------------------------
-- Start a game for the table. Picks questions the table hasn't had today where possible.
-- Errors: not_found, game_running, too_many_games, no_questions
-- ---------------------------------------------------------------------------
create or replace function public.tp_trivia_start(p_session_id uuid, p_player_id uuid)
returns public.trivia_games
language plpgsql set search_path = public, pg_temp as $$
declare
  s    public.table_sessions;
  t    record;
  ids  uuid[];
  g    public.trivia_games;
begin
  select * into s from public.tp_trivia_session(p_session_id);
  if s.id is null then raise exception 'not_found'; end if;
  perform 1 from trivia_players where id = p_player_id and session_id = s.id;
  if not found then raise exception 'not_found'; end if;
  perform 1 from table_sessions where id = s.id for update;          -- one start at a time per table
  if exists (select 1 from trivia_games where session_id = s.id and ends_at > now()) then raise exception 'game_running'; end if;
  if (select count(*) from trivia_games where session_id = s.id) >= 12 then raise exception 'too_many_games'; end if;
  select * into t from public.tp_trivia_timing();

  with seen as (
    select unnest(question_ids) id from trivia_games where session_id = s.id
  ), pool as (
    select q.id, (q.id in (select id from seen)) as was_seen, (q.restaurant_id is not null) as house
      from trivia_questions q
     where q.active and (q.restaurant_id is null or q.restaurant_id = s.restaurant_id)
  )
  select array_agg(id) into ids from (
    select id from pool order by was_seen, house desc, random() limit t.questions
  ) x;
  if ids is null or array_length(ids, 1) < 3 then raise exception 'no_questions'; end if;

  insert into trivia_games (restaurant_id, session_id, table_id, question_ids, starts_at, ends_at)
  values (s.restaurant_id, s.id, s.table_id, ids,
          now() + make_interval(secs => t.lead_in),
          now() + make_interval(secs => t.lead_in + array_length(ids, 1) * (t.answer_s + t.reveal_s)))
  returning * into g;
  return g;
end $$;

-- ---------------------------------------------------------------------------
-- Answer the question that is open right now. The server decides which one that is.
-- Points: 0 if wrong; 500 + up to 500 for speed if right.
-- Errors: not_found, not_open, already_answered, bad_choice
-- ---------------------------------------------------------------------------
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
  perform 1 from trivia_players where id = p_player_id and session_id = g.session_id;
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

revoke all on function public.tp_trivia_timing() from public, anon, authenticated;
revoke all on function public.tp_trivia_session(uuid) from public, anon, authenticated;
revoke all on function public.tp_trivia_join(uuid, text) from public, anon, authenticated;
revoke all on function public.tp_trivia_start(uuid, uuid) from public, anon, authenticated;
revoke all on function public.tp_trivia_answer(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.tp_trivia_timing() to service_role;
grant execute on function public.tp_trivia_session(uuid) to service_role;
grant execute on function public.tp_trivia_join(uuid, text) to service_role;
grant execute on function public.tp_trivia_start(uuid, uuid) to service_role;
grant execute on function public.tp_trivia_answer(uuid, uuid, int, int) to service_role;

-- Built-in question pack (EN / AR / UR). Re-running updates these rows in place.
-- 38 built-in questions
insert into public.trivia_questions (code, category, q_en, q_ar, q_ur, options, correct) values
  ('b01', 'food', 'Which spice gives biryani its golden colour?', 'أي بهار يعطي البرياني لونه الذهبي؟', 'بریانی کو سنہری رنگ کون سا مصالحہ دیتا ہے؟', '[{"en": "Black pepper", "ar": "الفلفل الأسود", "ur": "کالی مرچ"}, {"en": "Cumin", "ar": "الكمون", "ur": "زیرہ"}, {"en": "Saffron", "ar": "الزعفران", "ur": "زعفران"}, {"en": "Cardamom", "ar": "الهيل", "ur": "الائچی"}]'::jsonb, 2),
  ('b02', 'food', 'Falafel is made from chickpeas or which other bean?', 'تُصنع الفلافل من الحمص أو من أي حبوب أخرى؟', 'فلافل چنے یا کس دوسری پھلی سے بنتا ہے؟', '[{"en": "Kidney beans", "ar": "الفاصوليا الحمراء", "ur": "راجما"}, {"en": "Soybeans", "ar": "فول الصويا", "ur": "سویابین"}, {"en": "Black beans", "ar": "الفاصوليا السوداء", "ur": "کالا لوبیا"}, {"en": "Fava beans", "ar": "الفول", "ur": "باقلا"}]'::jsonb, 3),
  ('b03', 'food', 'What is the main ingredient of guacamole?', 'ما المكوّن الرئيسي في الغواكامولي؟', 'گواکامولے کا بنیادی جزو کیا ہے؟', '[{"en": "Tomato", "ar": "الطماطم", "ur": "ٹماٹر"}, {"en": "Avocado", "ar": "الأفوكادو", "ur": "ایووکاڈو"}, {"en": "Eggplant", "ar": "الباذنجان", "ur": "بینگن"}, {"en": "Cucumber", "ar": "الخيار", "ur": "کھیرا"}]'::jsonb, 1),
  ('b04', 'food', 'Which fruit is called the ''king of fruits'' in South Asia?', 'أي فاكهة تُلقّب بـ«ملكة الفواكه» في جنوب آسيا؟', 'جنوبی ایشیا میں کس پھل کو «پھلوں کا بادشاہ» کہا جاتا ہے؟', '[{"en": "Guava", "ar": "الجوافة", "ur": "امرود"}, {"en": "Apple", "ar": "التفاح", "ur": "سیب"}, {"en": "Mango", "ar": "المانجو", "ur": "آم"}, {"en": "Banana", "ar": "الموز", "ur": "کیلا"}]'::jsonb, 2),
  ('b05', 'food', 'Marzipan is made mainly from which nut?', 'يُصنع المرزبان أساسًا من أي نوع من المكسرات؟', 'مارزیپان زیادہ تر کس میوے سے بنتا ہے؟', '[{"en": "Peanut", "ar": "الفول السوداني", "ur": "مونگ پھلی"}, {"en": "Almond", "ar": "اللوز", "ur": "بادام"}, {"en": "Walnut", "ar": "الجوز", "ur": "اخروٹ"}, {"en": "Hazelnut", "ar": "البندق", "ur": "فندق"}]'::jsonb, 1),
  ('b06', 'food', 'How many teaspoons make one tablespoon?', 'كم ملعقة صغيرة تساوي ملعقة كبيرة واحدة؟', 'ایک بڑا چمچ کتنے چھوٹے چمچ کے برابر ہوتا ہے؟', '[{"en": "4", "ar": "4", "ur": "4"}, {"en": "5", "ar": "5", "ur": "5"}, {"en": "3", "ar": "3", "ur": "3"}, {"en": "2", "ar": "2", "ur": "2"}]'::jsonb, 2),
  ('b07', 'food', 'Sushi comes from which country?', 'من أي بلد يأتي السوشي؟', 'سوشی کس ملک سے آیا ہے؟', '[{"en": "China", "ar": "الصين", "ur": "چین"}, {"en": "Korea", "ar": "كوريا", "ur": "کوریا"}, {"en": "Thailand", "ar": "تايلاند", "ur": "تھائی لینڈ"}, {"en": "Japan", "ar": "اليابان", "ur": "جاپان"}]'::jsonb, 3),
  ('b08', 'food', 'Which nut is most often sprinkled on kunafa?', 'أي نوع من المكسرات يُرشّ غالبًا على الكنافة؟', 'کنافہ پر زیادہ تر کون سا میوہ چھڑکا جاتا ہے؟', '[{"en": "Cashew", "ar": "الكاجو", "ur": "کاجو"}, {"en": "Pistachio", "ar": "الفستق الحلبي", "ur": "پستہ"}, {"en": "Peanut", "ar": "الفول السوداني", "ur": "مونگ پھلی"}, {"en": "Walnut", "ar": "الجوز", "ur": "اخروٹ"}]'::jsonb, 1),
  ('b09', 'food', 'Paneer is a type of what?', 'البانير هو نوع من ماذا؟', 'پنیر کس چیز کی ایک قسم ہے؟', '[{"en": "Bread", "ar": "الخبز", "ur": "روٹی"}, {"en": "Rice", "ar": "الأرز", "ur": "چاول"}, {"en": "Cheese", "ar": "الجبن", "ur": "چیز (پنیر)"}, {"en": "Sauce", "ar": "الصلصة", "ur": "چٹنی"}]'::jsonb, 2),
  ('b10', 'food', 'What makes chilli peppers taste hot?', 'ما الذي يجعل الفلفل الحار حارًا؟', 'مرچ کو تیز کون سی چیز بناتی ہے؟', '[{"en": "Sugar", "ar": "السكر", "ur": "چینی"}, {"en": "Vitamin C", "ar": "فيتامين سي", "ur": "وٹامن سی"}, {"en": "Salt", "ar": "الملح", "ur": "نمک"}, {"en": "Capsaicin", "ar": "الكابسيسين", "ur": "کیپسیسن"}]'::jsonb, 3),
  ('b11', 'food', 'Coffee beans are the seeds of a…', 'حبوب القهوة هي بذور…', 'کافی کے دانے کس چیز کے بیج ہیں؟', '[{"en": "Root", "ar": "جذر", "ur": "جڑ"}, {"en": "Fruit (coffee cherry)", "ar": "ثمرة (كرز القهوة)", "ur": "پھل (کافی چیری)"}, {"en": "Nut", "ar": "مكسرات", "ur": "میوہ"}, {"en": "Flower", "ar": "زهرة", "ur": "پھول"}]'::jsonb, 1),
  ('b12', 'food', 'Pizza Margherita comes from which country?', 'من أي بلد تأتي بيتزا مارغريتا؟', 'پیزا مارگریٹا کس ملک سے آیا ہے؟', '[{"en": "Greece", "ar": "اليونان", "ur": "یونان"}, {"en": "France", "ar": "فرنسا", "ur": "فرانس"}, {"en": "Spain", "ar": "إسبانيا", "ur": "اسپین"}, {"en": "Italy", "ar": "إيطاليا", "ur": "اٹلی"}]'::jsonb, 3),
  ('b13', 'geo', 'What is the capital of Saudi Arabia?', 'ما عاصمة المملكة العربية السعودية؟', 'سعودی عرب کا دارالحکومت کیا ہے؟', '[{"en": "Abha", "ar": "أبها", "ur": "ابہا"}, {"en": "Dammam", "ar": "الدمام", "ur": "دمام"}, {"en": "Riyadh", "ar": "الرياض", "ur": "ریاض"}, {"en": "Jeddah", "ar": "جدة", "ur": "جدہ"}]'::jsonb, 2),
  ('b14', 'geo', 'What is the capital of Pakistan?', 'ما عاصمة باكستان؟', 'پاکستان کا دارالحکومت کیا ہے؟', '[{"en": "Karachi", "ar": "كراتشي", "ur": "کراچی"}, {"en": "Peshawar", "ar": "بيشاور", "ur": "پشاور"}, {"en": "Islamabad", "ar": "إسلام آباد", "ur": "اسلام آباد"}, {"en": "Lahore", "ar": "لاهور", "ur": "لاہور"}]'::jsonb, 2),
  ('b15', 'geo', 'What is the highest mountain in Pakistan?', 'ما أعلى جبل في باكستان؟', 'پاکستان کا سب سے اونچا پہاڑ کون سا ہے؟', '[{"en": "Nanga Parbat", "ar": "نانغا باربات", "ur": "نانگا پربت"}, {"en": "Tirich Mir", "ar": "تيريتش مير", "ur": "ترچ میر"}, {"en": "Rakaposhi", "ar": "راكابوشي", "ur": "راکاپوشی"}, {"en": "K2", "ar": "كي 2", "ur": "کے ٹو"}]'::jsonb, 3),
  ('b16', 'geo', 'Which river flows past Lahore?', 'أي نهر يمر بمدينة لاهور؟', 'لاہور کے پاس سے کون سا دریا گزرتا ہے؟', '[{"en": "Ravi", "ar": "رافي", "ur": "راوی"}, {"en": "Indus", "ar": "السند", "ur": "سندھ"}, {"en": "Chenab", "ar": "تشيناب", "ur": "چناب"}, {"en": "Jhelum", "ar": "جيلوم", "ur": "جہلم"}]'::jsonb, 0),
  ('b17', 'geo', 'What is the largest hot desert in the world?', 'ما أكبر صحراء حارة في العالم؟', 'دنیا کا سب سے بڑا گرم صحرا کون سا ہے؟', '[{"en": "Sahara", "ar": "الصحراء الكبرى", "ur": "صحارا"}, {"en": "Kalahari", "ar": "صحراء كالاهاري", "ur": "کالاہاری"}, {"en": "Gobi", "ar": "صحراء غوبي", "ur": "گوبی"}, {"en": "Thar", "ar": "صحراء ثار", "ur": "تھر"}]'::jsonb, 0),
  ('b18', 'geo', 'Which city is called the ''Bride of the Red Sea''?', 'أي مدينة تُلقّب بـ«عروس البحر الأحمر»؟', 'کس شہر کو «بحیرہ احمر کی دلہن» کہا جاتا ہے؟', '[{"en": "Port Sudan", "ar": "بورتسودان", "ur": "پورٹ سوڈان"}, {"en": "Jeddah", "ar": "جدة", "ur": "جدہ"}, {"en": "Yanbu", "ar": "ينبع", "ur": "ینبع"}, {"en": "Aqaba", "ar": "العقبة", "ur": "عقبہ"}]'::jsonb, 1),
  ('b19', 'geo', 'How many continents are there?', 'كم عدد القارات؟', 'دنیا میں کتنے براعظم ہیں؟', '[{"en": "8", "ar": "8", "ur": "8"}, {"en": "7", "ar": "7", "ur": "7"}, {"en": "6", "ar": "6", "ur": "6"}, {"en": "5", "ar": "5", "ur": "5"}]'::jsonb, 1),
  ('b20', 'geo', 'What is the largest ocean?', 'ما أكبر محيط؟', 'سب سے بڑا سمندر (بحر) کون سا ہے؟', '[{"en": "Arctic", "ar": "المحيط المتجمد الشمالي", "ur": "بحر منجمد شمالی"}, {"en": "Atlantic", "ar": "المحيط الأطلسي", "ur": "بحر اوقیانوس"}, {"en": "Indian", "ar": "المحيط الهندي", "ur": "بحر ہند"}, {"en": "Pacific", "ar": "المحيط الهادئ", "ur": "بحر الکاہل"}]'::jsonb, 3),
  ('b21', 'geo', 'Karachi lies on which sea?', 'على أي بحر تقع كراتشي؟', 'کراچی کس سمندر کے کنارے ہے؟', '[{"en": "Arabian Sea", "ar": "بحر العرب", "ur": "بحیرہ عرب"}, {"en": "Caspian Sea", "ar": "بحر قزوين", "ur": "بحیرہ کیسپین"}, {"en": "Red Sea", "ar": "البحر الأحمر", "ur": "بحیرہ احمر"}, {"en": "Black Sea", "ar": "البحر الأسود", "ur": "بحیرہ اسود"}]'::jsonb, 0),
  ('b22', 'geo', 'The Empty Quarter (Rub'' al Khali) is in which peninsula?', 'في أي شبه جزيرة تقع الربع الخالي؟', 'ربع الخالی کس جزیرہ نما میں ہے؟', '[{"en": "Sinai", "ar": "سيناء", "ur": "سینا"}, {"en": "Arabian Peninsula", "ar": "شبه الجزيرة العربية", "ur": "جزیرہ نما عرب"}, {"en": "Iberian Peninsula", "ar": "شبه الجزيرة الإيبيرية", "ur": "جزیرہ نما آئبیریا"}, {"en": "Indian subcontinent", "ar": "شبه القارة الهندية", "ur": "برصغیر"}]'::jsonb, 1),
  ('b23', 'science', 'Which planet is known as the Red Planet?', 'أي كوكب يُعرف بالكوكب الأحمر؟', 'کس سیارے کو سرخ سیارہ کہا جاتا ہے؟', '[{"en": "Mercury", "ar": "عطارد", "ur": "عطارد"}, {"en": "Venus", "ar": "الزهرة", "ur": "زہرہ"}, {"en": "Jupiter", "ar": "المشتري", "ur": "مشتری"}, {"en": "Mars", "ar": "المريخ", "ur": "مریخ"}]'::jsonb, 3),
  ('b24', 'science', 'At sea level, water boils at…', 'عند مستوى سطح البحر، يغلي الماء عند…', 'سطح سمندر پر پانی کتنے درجے پر ابلتا ہے؟', '[{"en": "80 °C", "ar": "80 درجة مئوية", "ur": "80 ڈگری سیلسیئس"}, {"en": "100 °C", "ar": "100 درجة مئوية", "ur": "100 ڈگری سیلسیئس"}, {"en": "120 °C", "ar": "120 درجة مئوية", "ur": "120 ڈگری سیلسیئس"}, {"en": "90 °C", "ar": "90 درجة مئوية", "ur": "90 ڈگری سیلسیئس"}]'::jsonb, 1),
  ('b25', 'science', 'How many legs does a spider have?', 'كم عدد أرجل العنكبوت؟', 'مکڑی کی کتنی ٹانگیں ہوتی ہیں؟', '[{"en": "10", "ar": "10", "ur": "10"}, {"en": "8", "ar": "8", "ur": "8"}, {"en": "6", "ar": "6", "ur": "6"}, {"en": "4", "ar": "4", "ur": "4"}]'::jsonb, 1),
  ('b26', 'science', 'Which gas do plants take in to make food?', 'أي غاز تمتصه النباتات لصنع غذائها؟', 'پودے خوراک بنانے کے لیے کون سی گیس لیتے ہیں؟', '[{"en": "Helium", "ar": "الهيليوم", "ur": "ہیلیم"}, {"en": "Oxygen", "ar": "الأكسجين", "ur": "آکسیجن"}, {"en": "Nitrogen", "ar": "النيتروجين", "ur": "نائٹروجن"}, {"en": "Carbon dioxide", "ar": "ثاني أكسيد الكربون", "ur": "کاربن ڈائی آکسائیڈ"}]'::jsonb, 3),
  ('b27', 'science', 'What is the largest organ of the human body?', 'ما أكبر عضو في جسم الإنسان؟', 'انسانی جسم کا سب سے بڑا عضو کون سا ہے؟', '[{"en": "Skin", "ar": "الجلد", "ur": "جلد"}, {"en": "Liver", "ar": "الكبد", "ur": "جگر"}, {"en": "Lungs", "ar": "الرئتان", "ur": "پھیپھڑے"}, {"en": "Heart", "ar": "القلب", "ur": "دل"}]'::jsonb, 0),
  ('b28', 'science', 'What is the fastest land animal?', 'ما أسرع حيوان بري؟', 'زمین پر سب سے تیز دوڑنے والا جانور کون سا ہے؟', '[{"en": "Cheetah", "ar": "الفهد", "ur": "چیتا"}, {"en": "Lion", "ar": "الأسد", "ur": "شیر"}, {"en": "Horse", "ar": "الحصان", "ur": "گھوڑا"}, {"en": "Gazelle", "ar": "الغزال", "ur": "ہرن"}]'::jsonb, 0),
  ('b29', 'science', 'How many bones does an adult human have?', 'كم عدد عظام الإنسان البالغ؟', 'ایک بالغ انسان کی کتنی ہڈیاں ہوتی ہیں؟', '[{"en": "250", "ar": "250", "ur": "250"}, {"en": "180", "ar": "180", "ur": "180"}, {"en": "300", "ar": "300", "ur": "300"}, {"en": "206", "ar": "206", "ur": "206"}]'::jsonb, 3),
  ('b30', 'science', 'Which vitamin does sunlight help our body make?', 'أي فيتامين تساعد أشعة الشمس الجسم على إنتاجه؟', 'دھوپ ہمارے جسم کو کون سا وٹامن بنانے میں مدد دیتی ہے؟', '[{"en": "Vitamin C", "ar": "فيتامين سي", "ur": "وٹامن سی"}, {"en": "Vitamin D", "ar": "فيتامين د", "ur": "وٹامن ڈی"}, {"en": "Vitamin A", "ar": "فيتامين أ", "ur": "وٹامن اے"}, {"en": "Vitamin B12", "ar": "فيتامين ب12", "ur": "وٹامن بی 12"}]'::jsonb, 1),
  ('b31', 'science', 'What is the closest star to Earth?', 'ما أقرب نجم إلى الأرض؟', 'زمین کے سب سے قریب ستارہ کون سا ہے؟', '[{"en": "The Moon", "ar": "القمر", "ur": "چاند"}, {"en": "Polaris", "ar": "النجم القطبي", "ur": "قطبی ستارہ"}, {"en": "Sirius", "ar": "الشعرى اليمانية", "ur": "شعریٰ"}, {"en": "The Sun", "ar": "الشمس", "ur": "سورج"}]'::jsonb, 3),
  ('b32', 'general', 'How many minutes are in 3 hours?', 'كم دقيقة في 3 ساعات؟', '3 گھنٹوں میں کتنے منٹ ہوتے ہیں؟', '[{"en": "180", "ar": "180", "ur": "180"}, {"en": "150", "ar": "150", "ur": "150"}, {"en": "120", "ar": "120", "ur": "120"}, {"en": "200", "ar": "200", "ur": "200"}]'::jsonb, 0),
  ('b33', 'general', 'How many sides does a hexagon have?', 'كم ضلعًا للشكل السداسي؟', 'مسدس کے کتنے اضلاع ہوتے ہیں؟', '[{"en": "8", "ar": "8", "ur": "8"}, {"en": "5", "ar": "5", "ur": "5"}, {"en": "6", "ar": "6", "ur": "6"}, {"en": "7", "ar": "7", "ur": "7"}]'::jsonb, 2),
  ('b34', 'general', 'Which animal is called the ''ship of the desert''?', 'أي حيوان يُلقّب بـ«سفينة الصحراء»؟', 'کس جانور کو «صحرا کا جہاز» کہا جاتا ہے؟', '[{"en": "Horse", "ar": "الحصان", "ur": "گھوڑا"}, {"en": "Goat", "ar": "الماعز", "ur": "بکری"}, {"en": "Camel", "ar": "الجمل", "ur": "اونٹ"}, {"en": "Donkey", "ar": "الحمار", "ur": "گدھا"}]'::jsonb, 2),
  ('b35', 'general', 'Mixing blue and yellow makes which colour?', 'ما اللون الناتج عن خلط الأزرق والأصفر؟', 'نیلا اور پیلا ملانے سے کون سا رنگ بنتا ہے؟', '[{"en": "Purple", "ar": "البنفسجي", "ur": "جامنی"}, {"en": "Orange", "ar": "البرتقالي", "ur": "نارنجی"}, {"en": "Green", "ar": "الأخضر", "ur": "سبز"}, {"en": "Brown", "ar": "البني", "ur": "بھورا"}]'::jsonb, 2),
  ('b36', 'general', 'Which sport uses a shuttlecock?', 'أي رياضة تُستخدم فيها الريشة؟', 'کس کھیل میں شٹل کاک استعمال ہوتی ہے؟', '[{"en": "Tennis", "ar": "التنس", "ur": "ٹینس"}, {"en": "Table tennis", "ar": "تنس الطاولة", "ur": "ٹیبل ٹینس"}, {"en": "Badminton", "ar": "الريشة الطائرة", "ur": "بیڈمنٹن"}, {"en": "Squash", "ar": "الإسكواش", "ur": "اسکواش"}]'::jsonb, 2),
  ('b37', 'general', 'How many players does a cricket team have on the field?', 'كم لاعبًا في فريق الكريكيت داخل الملعب؟', 'کرکٹ ٹیم کے میدان میں کتنے کھلاڑی ہوتے ہیں؟', '[{"en": "11", "ar": "11", "ur": "11"}, {"en": "10", "ar": "10", "ur": "10"}, {"en": "9", "ar": "9", "ur": "9"}, {"en": "12", "ar": "12", "ur": "12"}]'::jsonb, 0),
  ('b38', 'general', 'How many days are in a leap year?', 'كم يومًا في السنة الكبيسة؟', 'لیپ سال میں کتنے دن ہوتے ہیں؟', '[{"en": "364", "ar": "364", "ur": "364"}, {"en": "365", "ar": "365", "ur": "365"}, {"en": "360", "ar": "360", "ur": "360"}, {"en": "366", "ar": "366", "ur": "366"}]'::jsonb, 3)
on conflict (code) do update set category = excluded.category, q_en = excluded.q_en, q_ar = excluded.q_ar, q_ur = excluded.q_ur, options = excluded.options, correct = excluded.correct;
