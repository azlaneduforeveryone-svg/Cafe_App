"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Check, Crown, Play, Trophy, Users, X } from "lucide-react";
import { fmt } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { TriviaScore, TriviaSnapshot } from "@/lib/trivia";
import type { Locale } from "@/lib/types";

const T = { leadIn: 5, answer: 15, reveal: 5 };
const SLOT = T.answer + T.reveal;
const LETTERS = ["A", "B", "C", "D"];

/** Where the game is by the (server-corrected) clock. */
function clockPhase(startsAt: number, total: number, now: number) {
  const el = (now - startsAt) / 1000;
  if (el < 0) return { phase: "countdown" as const, index: -1, left: Math.ceil(-el) };
  const index = Math.floor(el / SLOT);
  if (index >= total) return { phase: "done" as const, index: total - 1, left: 0 };
  const into = el - index * SLOT;
  return into <= T.answer ? { phase: "question" as const, index, left: Math.ceil(T.answer - into) } : { phase: "reveal" as const, index, left: Math.ceil(SLOT - into) };
}

export function TriviaSheet({ t, locale, tableId, onClose }: { t: Dict; locale: Locale; tableId: string; onClose: () => void }) {
  const url = `/api/table/${tableId}/trivia`;
  const d = t as unknown as Record<string, string>;
  const [snap, setSnap] = useState<TriviaSnapshot | null>(null);
  const [gone, setGone] = useState(false);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ game: string; index: number; choice: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const sent = Date.now();
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (!res) return;
    if (!res.ok) {
      setGone(true);
      return;
    }
    const s = (await res.json()) as TriviaSnapshot;
    // The server stamps its time just before replying, so only the trip back is unknown:
    // half the round trip at most, capped at a typical mobile hop (the server's work is in the round trip too).
    const got = Date.now();
    setOffset(s.serverNow - (got - Math.min(150, (got - sent) / 2)));
    setSnap(s);
  }, [url]);

  // Clock tick for countdowns.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Refetch at the next phase change while a game runs, otherwise every few seconds.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    let wait = snap ? 4000 : 0;
    const g = snap?.game;
    if (g && g.phase !== "done") {
      const nowS = Date.now() + offset;
      const el = (nowS - g.startsAt) / 1000;
      const next = el < 0 ? -el : el % SLOT <= T.answer ? T.answer - (el % SLOT) : SLOT - (el % SLOT);
      wait = Math.max(300, next * 1000 + 300);
      // While a question is open, also refresh how many have answered.
      if (g.phase === "question") wait = Math.min(wait, 2500);
    } else if (g?.phase === "done") wait = 8000;
    timer.current = setTimeout(() => void load(), wait);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [snap, offset, load]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const code = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : undefined;
      if (code !== "already_answered") setError((code && d[`trvErr_${code}`]) || t.errorGeneric);
    }
    await load();
    return !!res?.ok;
  }

  const g = snap?.game ?? null;
  const live = g && now ? clockPhase(g.startsAt, g.total, now + offset) : null;
  const q = g?.question && live && g.question.index === live.index ? g.question : null;
  const myChoice = q ? (q.myChoice ?? (picked && picked.game === g!.id && picked.index === q.index ? picked.choice : null)) : null;
  const myId = snap?.me?.id;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={t.trvTitle}>
      <div className="w-full max-w-md h-[94dvh] sm:h-auto sm:max-h-[92dvh] overflow-y-auto bg-ink text-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <h2 className="display text-xl font-bold flex items-center gap-2">
            <Brain className="w-5 h-5 text-gold" aria-hidden />
            {t.trvTitle}
          </h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 px-5 pb-6 space-y-5">
          {gone && <p className="text-center py-10 text-white/70">{t.trvErr_table_closed}</p>}
          {!gone && !snap && <p className="text-center py-10 text-white/60">…</p>}
          {!gone && snap && !snap.on && <p className="text-center py-10 text-white/70">{t.trvErr_trivia_off}</p>}

          {/* Join */}
          {!gone && snap?.on && !snap.me && (
            <form
              className="space-y-3 pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) void act({ action: "join", nickname: name });
              }}
            >
              <p className="text-white/80 text-sm">{t.trvJoinIntro}</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 16))}
                maxLength={16}
                autoComplete="nickname"
                placeholder={t.trvNickname}
                aria-label={t.trvNickname}
                className="w-full rounded-2xl bg-white/10 border border-white/20 px-4 py-3.5 text-lg font-bold placeholder:text-white/40"
              />
              <button type="submit" disabled={busy || !name.trim()} className="w-full py-3.5 rounded-2xl bg-gold text-ink font-extrabold disabled:opacity-50">
                {t.trvJoin}
              </button>
              <p className="text-[11px] text-white/50">{t.trvNamePrivacy}</p>
              <Players t={t} players={snap.players} myId={myId} />
            </form>
          )}

          {/* Lobby */}
          {!gone && snap?.on && snap.me && (!g || (live?.phase === "done" && !g.scores.length)) && (
            <div className="space-y-4 pt-2">
              <Players t={t} players={snap.players} myId={myId} />
              <p className="text-sm text-white/70">{t.trvRules}</p>
              {snap.gamesLeft > 0 ? (
                <button type="button" disabled={busy} onClick={() => void act({ action: "start" })} className="w-full py-4 rounded-2xl bg-gold text-ink font-extrabold text-lg flex items-center justify-center gap-2 disabled:opacity-50">
                  <Play className="w-5 h-5" aria-hidden />
                  {t.trvStart}
                </button>
              ) : (
                <p className="text-sm text-white/70">{t.trvErr_too_many_games}</p>
              )}
              <Board t={t} board={snap.board} />
            </div>
          )}

          {/* Countdown */}
          {!gone && g && live?.phase === "countdown" && (
            <div className="text-center py-14 space-y-2">
              <p className="text-white/70 font-bold">{t.trvGetReady}</p>
              <p className="text-7xl font-extrabold text-gold tabular-nums" aria-live="polite">
                {live.left}
              </p>
            </div>
          )}

          {/* Question / reveal */}
          {!gone && g && live && (live.phase === "question" || live.phase === "reveal") && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm font-bold text-white/70">
                <span>{fmt(t.trvQuestionOf, { n: live.index + 1, total: g.total })}</span>
                <span className={`tabular-nums ${live.phase === "question" && live.left <= 5 ? "text-gold" : ""}`}>{live.phase === "question" ? `${live.left}s` : t.trvAnswer}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-gold transition-[width] duration-300" style={{ width: live.phase === "question" ? `${(live.left / T.answer) * 100}%` : "0%" }} />
              </div>
              {q ? (
                <>
                  <p className="text-xl font-extrabold leading-snug min-h-[3.5rem]">{q.text[locale]}</p>
                  <div className="grid gap-2.5">
                    {q.options.map((o, i) => {
                      const reveal = live.phase === "reveal" && q.correct !== null;
                      const right = reveal && i === q.correct;
                      const wrongMine = reveal && i === myChoice && i !== q.correct;
                      const mine = myChoice === i;
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={live.phase !== "question" || myChoice !== null || busy}
                          onClick={async () => {
                            setPicked({ game: g.id, index: q.index, choice: i });
                            await act({ action: "answer", gameId: g.id, index: q.index, choice: i });
                          }}
                          className={`w-full text-start px-4 py-3.5 rounded-2xl border-2 font-bold flex items-center gap-3 transition ${
                            right ? "bg-emerald-500 border-emerald-400 text-white" : wrongMine ? "bg-red-500/80 border-red-400" : mine ? "bg-white text-ink border-white" : "bg-white/5 border-white/15"
                          } ${reveal && !right && !wrongMine ? "opacity-50" : ""}`}
                        >
                          <span className={`w-7 h-7 rounded-full text-xs flex items-center justify-center shrink-0 ${mine || right ? "bg-ink/20" : "bg-white/10"}`}>{right ? <Check className="w-4 h-4" aria-hidden /> : LETTERS[i]}</span>
                          <span className="flex-1">{o[locale]}</span>
                          {reveal && q.counts && q.counts[i] > 0 && <span className="text-xs opacity-80 tabular-nums">{q.counts[i]}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {live.phase === "question" && myChoice !== null && (
                    <p className="text-center text-sm text-white/70">{fmt(t.trvWaiting, { n: g.answeredCount, total: snap!.players.length })}</p>
                  )}
                  {live.phase === "reveal" && (
                    <p className={`text-center font-extrabold ${q.myPoints ? "text-gold" : "text-white/70"}`}>
                      {myChoice === null ? t.trvNoAnswer : q.myPoints ? fmt(t.trvPoints, { n: q.myPoints }) : t.trvWrong}
                    </p>
                  )}
                  {live.phase === "reveal" && <Scores t={t} scores={g.scores} myId={myId} compact />}
                </>
              ) : (
                <p className="text-center text-white/60 py-10">…</p>
              )}
            </div>
          )}

          {/* Final */}
          {!gone && g && live?.phase === "done" && g.scores.length > 0 && (
            <div className="space-y-4 pt-2">
              <p className="text-center">
                <Trophy className="w-10 h-10 text-gold mx-auto" aria-hidden />
              </p>
              <p className="text-center text-2xl font-extrabold">{g.scores[0].points > 0 ? fmt(t.trvWinner, { name: g.scores[0].nickname }) : t.trvGameOver}</p>
              <Scores t={t} scores={g.scores} myId={myId} />
              {snap!.gamesLeft > 0 && (
                <button type="button" disabled={busy} onClick={() => void act({ action: "start" })} className="w-full py-3.5 rounded-2xl bg-gold text-ink font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
                  <Play className="w-5 h-5" aria-hidden />
                  {t.trvAgain}
                </button>
              )}
              <Board t={t} board={snap!.board} />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm font-bold text-red-200 bg-red-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Players({ t, players, myId }: { t: Dict; players: { id: string; nickname: string }[]; myId?: string }) {
  if (!players.length) return null;
  return (
    <div>
      <p className="text-xs font-extrabold uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" aria-hidden />
        {fmt(t.trvPlayers, { n: players.length })}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {players.map((p) => (
          <li key={p.id} className={`px-3 py-1.5 rounded-full text-sm font-bold ${p.id === myId ? "bg-gold text-ink" : "bg-white/10"}`}>
            <bdi>{p.nickname}</bdi>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Scores({ t, scores, myId, compact = false }: { t: Dict; scores: TriviaScore[]; myId?: string; compact?: boolean }) {
  const list = compact ? scores.slice(0, 4) : scores;
  return (
    <ol className="space-y-1.5" aria-label={t.trvScores}>
      {list.map((s, i) => (
        <li key={s.playerId} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${s.playerId === myId ? "bg-white/15" : "bg-white/5"}`}>
          <span className="w-6 text-center font-extrabold">{i === 0 && s.points > 0 ? <Crown className="w-4 h-4 text-gold inline" aria-hidden /> : i + 1}</span>
          <bdi className="flex-1 font-bold truncate">{s.nickname}</bdi>
          {!compact && <span className="text-xs text-white/60">{fmt(t.trvCorrectN, { n: s.correct })}</span>}
          <span className="font-extrabold tabular-nums">{s.points.toLocaleString("en-US")}</span>
        </li>
      ))}
    </ol>
  );
}

function Board({ t, board }: { t: Dict; board: TriviaSnapshot["board"] }) {
  if (!board.length) return null;
  return (
    <section className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
      <p className="text-xs font-extrabold uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1.5">
        <Trophy className="w-3.5 h-3.5 text-gold" aria-hidden />
        {t.trvBoard}
      </p>
      <ol className="space-y-1">
        {board.map((b, i) => (
          <li key={b.table + i} className={`flex justify-between text-sm ${b.mine ? "text-gold font-extrabold" : ""}`}>
            <span>
              {i + 1}. <bdi>{b.table}</bdi>
              {b.mine ? ` (${t.trvYourTable})` : ""}
            </span>
            <span className="tabular-nums">{b.points.toLocaleString("en-US")}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
