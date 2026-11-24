import "server-only";
import { cookies } from "next/headers";
import { adminClient } from "./supabase/admin";
import { entryByToken, getRestaurantById } from "./queue";
import { SESSION_HOURS, guestSession, startOfBusinessDay, tableWithRestaurant } from "./tables";
import type { Restaurant } from "./types";

/**
 * Multiplayer trivia for one table. The database owns the clock and the answers; this layer
 * only shapes what a phone may see at this moment (never the correct answer while it's open).
 */

export const TIMING = { leadIn: 5, answer: 15, reveal: 5 } as const;
const SLOT = TIMING.answer + TIMING.reveal;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Who is playing together: everyone at one table session, or one waiting party (everyone who
 * opened that party's ticket link). Each phone keeps its own player cookie for that group.
 */
export interface TriviaScope {
  kind: "table" | "entry";
  id: string; // session id or entry id
  restaurant: Restaurant;
  tableId: string | null; // for "Top tables today" (your table highlighted)
  cookie: string;
}

const cookieFor = (kind: "table" | "entry", key: string) => (kind === "table" ? `tp_p_${key.replace(/-/g, "")}` : `tp_pe_${key.replace(/-/g, "")}`);

/** Scope for a phone on a table page (needs the table session cookie). */
export async function tableScope(tableId: string): Promise<TriviaScope | null> {
  const s = await guestSession(tableId);
  if (!s) return null;
  const tr = await tableWithRestaurant(tableId);
  if (!tr) return null;
  return { kind: "table", id: s.id, restaurant: tr.restaurant, tableId: s.table_id, cookie: cookieFor("table", tableId) };
}

/** Scope for a party still waiting, from their ticket link. */
export async function ticketScope(token: string): Promise<TriviaScope | null> {
  const e = await entryByToken(token);
  if (!e || (e.status !== "waiting" && e.status !== "notified")) return null;
  const r = await getRestaurantById(e.restaurantId);
  if (!r) return null;
  return { kind: "entry", id: e.id, restaurant: r, tableId: null, cookie: cookieFor("entry", e.id) };
}

const col = (sc: TriviaScope) => (sc.kind === "table" ? "session_id" : "entry_id");

type L3 = { en: string; ar: string; ur: string };
type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string; status: number };
const fail = (error: string, status: number) => ({ ok: false as const, error, status });

export interface TriviaQuestionView {
  index: number;
  text: L3;
  options: L3[];
  /** Only once the question has closed. */
  correct: number | null;
  myChoice: number | null;
  myPoints: number | null;
  /** How many players picked each option (only once closed). */
  counts: number[] | null;
}

export interface TriviaScore {
  playerId: string;
  nickname: string;
  points: number;
  correct: number;
}

export interface TriviaSnapshot {
  serverNow: number;
  on: boolean;
  me: { id: string; nickname: string } | null;
  players: { id: string; nickname: string }[];
  game: {
    id: string;
    startsAt: number;
    endsAt: number;
    total: number;
    phase: "countdown" | "question" | "reveal" | "done";
    question: TriviaQuestionView | null;
    scores: TriviaScore[];
    answeredCount: number;
  } | null;
  /** Today's best game score per table (labels only, no names). */
  board: { table: string; points: number; mine: boolean }[];
  gamesLeft: number;
}

interface QRow {
  id: string;
  q_en: string;
  q_ar: string;
  q_ur: string;
  options: { en: string; ar?: string; ur?: string }[];
  correct: number;
}
interface GameRow {
  id: string;
  session_id: string;
  table_id: string | null;
  question_ids: string[];
  starts_at: string;
  ends_at: string;
}

const l3 = (en: string, ar?: string, ur?: string): L3 => ({ en, ar: ar || en, ur: ur || en });

/**
 * Answer order shown to guests, shuffled per game and question so the right answer isn't
 * always in the same place (owners tend to type it first). order[shown] = stored index.
 */
function orderFor(gameId: string, index: number): number[] {
  let h = 2166136261;
  for (const ch of `${gameId}:${index}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

async function playerFor(sc: TriviaScope) {
  const token = (await cookies()).get(sc.cookie)?.value ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await adminClient().from("trivia_players").select("id, nickname").eq("token", token).eq(col(sc), sc.id).maybeSingle();
  return (data as { id: string; nickname: string } | null) ?? null;
}

function phaseOf(g: GameRow, now: number) {
  const elapsed = (now - Date.parse(g.starts_at)) / 1000;
  if (elapsed < 0) return { phase: "countdown" as const, index: -1 };
  const index = Math.floor(elapsed / SLOT);
  if (index >= g.question_ids.length) return { phase: "done" as const, index: g.question_ids.length - 1 };
  return { phase: elapsed - index * SLOT <= TIMING.answer ? ("question" as const) : ("reveal" as const), index };
}

/** Everything a phone in this group needs right now. */
export async function triviaSnapshot(sc: TriviaScope): Promise<TriviaSnapshot> {
  const r = sc.restaurant;
  const now = Date.now();
  const db = adminClient();
  const base: TriviaSnapshot = { serverNow: now, on: r.triviaOn, me: null, players: [], game: null, board: [], gamesLeft: 0 };
  if (!r.triviaOn) return base;

  const [me, { data: players }, { data: games }] = await Promise.all([
    playerFor(sc),
    db.from("trivia_players").select("id, nickname").eq(col(sc), sc.id).order("created_at"),
    db.from("trivia_games").select("*").eq(col(sc), sc.id).order("starts_at", { ascending: false }),
  ]);
  const list = (games ?? []) as GameRow[];
  base.me = me;
  base.players = (players ?? []) as { id: string; nickname: string }[];
  base.gamesLeft = Math.max(0, 12 - list.length);
  base.board = await board(r, sc.tableId ?? "");

  const g = list[0];
  base.serverNow = Date.now();
  if (!g) return base;
  const { phase, index } = phaseOf(g, now);
  // A finished game stays on screen for 10 minutes, then the table is back in the lobby.
  if (phase === "done" && now - Date.parse(g.ends_at) > 10 * 60_000) return { ...base, serverNow: Date.now() };

  const { data: answers } = await db.from("trivia_answers").select("player_id, q_index, choice, correct, points").eq("game_id", g.id);
  const ans = (answers ?? []) as { player_id: string; q_index: number; choice: number; correct: boolean; points: number }[];

  // Scores count only questions that have closed, so nobody learns an answer from a score jump.
  const closedBelow = phase === "question" ? index : index + 1;
  const scores = base.players
    .map((p) => {
      const mine = ans.filter((a) => a.player_id === p.id && a.q_index < closedBelow);
      return { playerId: p.id, nickname: p.nickname, points: mine.reduce((n, a) => n + a.points, 0), correct: mine.filter((a) => a.correct).length };
    })
    .sort((a, b) => b.points - a.points);

  let question: TriviaQuestionView | null = null;
  if (phase === "question" || phase === "reveal") {
    const { data } = await db.from("trivia_questions").select("id, q_en, q_ar, q_ur, options, correct").eq("id", g.question_ids[index]).maybeSingle();
    const qr = data as QRow | null;
    if (qr) {
      const open = phase === "question";
      const myA = me ? ans.find((a) => a.player_id === me.id && a.q_index === index) : undefined;
      const here = ans.filter((a) => a.q_index === index);
      const order = orderFor(g.id, index);
      const shown = (stored: number) => order.indexOf(stored);
      question = {
        index,
        text: l3(qr.q_en, qr.q_ar, qr.q_ur),
        options: order.map((k) => qr.options[k]).map((o) => l3(o.en, o.ar, o.ur)),
        correct: open ? null : shown(qr.correct),
        myChoice: myA ? shown(myA.choice) : null,
        myPoints: open || !myA ? null : myA.points,
        counts: open ? null : order.map((k) => here.filter((a) => a.choice === k).length),
      };
    }
  }
  base.serverNow = Date.now();
  base.game = {
    id: g.id,
    startsAt: Date.parse(g.starts_at),
    endsAt: Date.parse(g.ends_at),
    total: g.question_ids.length,
    phase,
    question,
    scores,
    answeredCount: index >= 0 ? ans.filter((a) => a.q_index === index).length : 0,
  };
  return base;
}

/** Best single-player game score per table today. Labels only. */
async function board(r: Restaurant, myTableId: string): Promise<TriviaSnapshot["board"]> {
  const db = adminClient();
  const since = new Date(startOfBusinessDay(r)).toISOString();
  const { data: games } = await db.from("trivia_games").select("id, table_id").eq("restaurant_id", r.id).gte("starts_at", since).lt("ends_at", new Date().toISOString()).limit(300);
  const gl = (games ?? []) as { id: string; table_id: string | null }[];
  if (!gl.length) return [];
  const { data: answers } = await db.from("trivia_answers").select("game_id, player_id, points").in("game_id", gl.map((g) => g.id));
  const perPlayer = new Map<string, number>();
  for (const a of (answers ?? []) as { game_id: string; player_id: string; points: number }[]) {
    const k = `${a.game_id}|${a.player_id}`;
    perPlayer.set(k, (perPlayer.get(k) ?? 0) + a.points);
  }
  const tableOf = new Map(gl.map((g) => [g.id, g.table_id]));
  const best = new Map<string, number>();
  for (const [k, pts] of perPlayer) {
    const tid = tableOf.get(k.split("|")[0]);
    if (tid) best.set(tid, Math.max(best.get(tid) ?? 0, pts));
  }
  const ids = [...best.keys()];
  if (!ids.length) return [];
  const { data: tables } = await db.from("restaurant_tables").select("id, table_number").in("id", ids);
  const label = new Map(((tables ?? []) as { id: string; table_number: string }[]).map((t) => [t.id, t.table_number]));
  return [...best.entries()]
    .filter(([, p]) => p > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tid, points]) => ({ table: label.get(tid) ?? "?", points, mine: tid === myTableId }));
}

const codeOf = (msg: string, codes: string[]) => codes.find((c) => msg.includes(c)) ?? "server_error";

export async function triviaJoin(sc: TriviaScope, nickname: unknown): Promise<Result> {
  if (await playerFor(sc)) return { ok: true, value: undefined };
  const name = typeof nickname === "string" ? nickname.slice(0, 40) : "";
  const { data, error } =
    sc.kind === "table"
      ? await adminClient().rpc("tp_trivia_join", { p_session_id: sc.id, p_nickname: name }).single()
      : await adminClient().rpc("tp_trivia_join_entry", { p_entry_id: sc.id, p_nickname: name }).single();
  if (error) {
    const code = codeOf(error.message, ["bad_name", "name_taken", "table_full", "not_found"]);
    return fail(code === "not_found" ? "trivia_off" : code, 409);
  }
  (await cookies()).set(sc.cookie, (data as { token: string }).token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return { ok: true, value: undefined };
}

export async function triviaStart(sc: TriviaScope): Promise<Result> {
  const me = await playerFor(sc);
  if (!me) return fail("join_first", 409);
  const { error } =
    sc.kind === "table"
      ? await adminClient().rpc("tp_trivia_start", { p_session_id: sc.id, p_player_id: me.id }).single()
      : await adminClient().rpc("tp_trivia_start_entry", { p_entry_id: sc.id, p_player_id: me.id }).single();
  if (error) return fail(codeOf(error.message, ["game_running", "too_many_games", "no_questions", "not_found"]), 409);
  return { ok: true, value: undefined };
}

export async function triviaAnswer(sc: TriviaScope, b: Record<string, unknown>): Promise<Result> {
  const me = await playerFor(sc);
  if (!me) return fail("join_first", 409);
  const gameId = typeof b.gameId === "string" && UUID.test(b.gameId) ? b.gameId : null;
  const qIndex = typeof b.index === "number" && Number.isInteger(b.index) ? b.index : -1;
  const choice = typeof b.choice === "number" && Number.isInteger(b.choice) ? b.choice : -1;
  if (!gameId || qIndex < 0 || choice < 0 || choice > 3) return fail("bad_choice", 400);
  // The phone sends the position it showed; store the original answer index.
  const stored = orderFor(gameId, qIndex)[choice];
  const { error } = await adminClient().rpc("tp_trivia_answer", { p_game_id: gameId, p_player_id: me.id, p_q_index: qIndex, p_choice: stored }).single();
  if (error) return fail(codeOf(error.message, ["not_open", "already_answered", "bad_choice", "not_found"]), 409);
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Owner
// ---------------------------------------------------------------------------

export interface HouseQuestion {
  id: string;
  text: L3;
  options: L3[];
  correct: number;
  active: boolean;
}

export async function listHouseQuestions(restaurantId: string): Promise<HouseQuestion[]> {
  const { data } = await adminClient().from("trivia_questions").select("id, q_en, q_ar, q_ur, options, correct, active").eq("restaurant_id", restaurantId).order("created_at");
  return ((data ?? []) as (QRow & { active: boolean })[]).map((q) => ({
    id: q.id,
    text: { en: q.q_en, ar: q.q_ar, ur: q.q_ur },
    options: q.options.map((o) => ({ en: o.en, ar: o.ar ?? "", ur: o.ur ?? "" })),
    correct: q.correct,
    active: q.active,
  }));
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function saveHouseQuestion(r: Restaurant, b: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const text = (b.text ?? {}) as Record<string, unknown>;
  const opts = Array.isArray(b.options) ? (b.options as Record<string, unknown>[]) : [];
  const correct = typeof b.correct === "number" ? b.correct : -1;
  const row = {
    restaurant_id: r.id,
    category: "house",
    q_en: clean(text.en, 160),
    q_ar: clean(text.ar, 160),
    q_ur: clean(text.ur, 160),
    options: opts.slice(0, 4).map((o) => ({ en: clean(o?.en, 60), ar: clean(o?.ar, 60), ur: clean(o?.ur, 60) })),
    correct,
    active: b.active !== false,
  };
  if (row.q_en.length < 3 || row.options.length !== 4 || row.options.some((o) => !o.en) || !(correct >= 0 && correct <= 3)) return fail("invalid", 400);
  const db = adminClient();
  if (typeof b.id === "string" && UUID.test(b.id)) {
    const { data, error } = await db.from("trivia_questions").update(row).eq("id", b.id).eq("restaurant_id", r.id).select("id").maybeSingle();
    if (error) return fail("server_error", 500);
    if (!data) return fail("not_found", 404);
    return { ok: true, value: { id: b.id } };
  }
  const { count } = await db.from("trivia_questions").select("id", { count: "exact", head: true }).eq("restaurant_id", r.id);
  if ((count ?? 0) >= 50) return fail("too_many", 409);
  const { data, error } = await db.from("trivia_questions").insert(row).select("id").single();
  if (error || !data) return fail("server_error", 500);
  return { ok: true, value: { id: (data as { id: string }).id } };
}

export async function deleteHouseQuestion(r: Restaurant, id: string): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  await adminClient().from("trivia_questions").delete().eq("id", id).eq("restaurant_id", r.id);
  return { ok: true, value: undefined };
}

export async function setTriviaOn(r: Restaurant, on: boolean): Promise<Result> {
  const { error } = await adminClient().from("restaurants").update({ trivia_on: on }).eq("id", r.id);
  return error ? fail("server_error", 500) : { ok: true, value: undefined };
}

/** Games played and players today, plus the top tables board (owner view). */
export async function triviaStats(r: Restaurant) {
  const db = adminClient();
  const since = new Date(startOfBusinessDay(r)).toISOString();
  const [{ count: games }, { count: players }, top, builtIn] = await Promise.all([
    db.from("trivia_games").select("id", { count: "exact", head: true }).eq("restaurant_id", r.id).gte("starts_at", since),
    db.from("trivia_players").select("id", { count: "exact", head: true }).eq("restaurant_id", r.id).gte("created_at", since),
    board(r, ""),
    db.from("trivia_questions").select("id", { count: "exact", head: true }).is("restaurant_id", null).eq("active", true),
  ]);
  return { games: games ?? 0, players: players ?? 0, top, builtIn: builtIn.count ?? 0 };
}
