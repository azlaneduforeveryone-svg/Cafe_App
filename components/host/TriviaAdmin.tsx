"use client";

import { useState } from "react";
import { Brain, Plus, Trophy } from "lucide-react";
import { fmt } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { HouseQuestion } from "@/lib/trivia";
import type { Locale } from "@/lib/types";

const field = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm";
const LETTERS = ["A", "B", "C", "D"];
const blank = (): HouseQuestion => ({ id: "", text: { en: "", ar: "", ur: "" }, options: [0, 1, 2, 3].map(() => ({ en: "", ar: "", ur: "" })), correct: 0, active: true });

export function TriviaAdmin({
  t,
  locale,
  owner,
  on,
  initialQuestions,
  stats,
}: {
  t: Dict;
  locale: Locale;
  owner: boolean;
  on: boolean;
  initialQuestions: HouseQuestion[];
  stats: { games: number; players: number; top: { table: string; points: number }[]; builtIn: number };
}) {
  const [enabled, setEnabled] = useState(on);
  const [questions, setQuestions] = useState(initialQuestions);
  const [editing, setEditing] = useState<HouseQuestion | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(body: unknown, method = "POST", qs = "") {
    const res = await fetch(`/api/host/trivia${qs}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    return !!res?.ok;
  }
  async function reload() {
    const res = await fetch("/api/host/trivia").catch(() => null);
    if (res?.ok) setQuestions(((await res.json()) as { questions: HouseQuestion[] }).questions);
  }

  return (
    <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl font-bold flex items-center gap-2">
            <Brain className="w-7 h-7 text-ember" aria-hidden />
            {t.triviaNav}
          </h1>
          <p className="text-sm text-stone-600 mt-1 max-w-xl">{t.trvAdminIntro}</p>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-center">
          {[
            [t.trvStatGames, stats.games],
            [t.trvStatPlayers, stats.players],
          ].map(([label, n]) => (
            <div key={String(label)} className="px-3 py-2 rounded-xl bg-white border border-line">
              <dt className="text-[11px] font-bold text-stone-500">{label}</dt>
              <dd className="text-xl font-extrabold">{n}</dd>
            </div>
          ))}
        </dl>
      </header>

      {msg && (
        <p role="alert" className="p-3 rounded-xl text-sm font-bold bg-red-50 text-red-800">
          {msg}
        </p>
      )}

      <section className="p-5 rounded-2xl bg-white border border-line flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-extrabold">{t.trvToggle}</p>
          <p className="text-xs text-stone-600">{fmt(t.trvBuiltIn, { n: stats.builtIn })}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t.trvToggle}
          disabled={!owner}
          onClick={async () => {
            const next = !enabled;
            if (await post({ on: next })) setEnabled(next);
          }}
          className={`w-14 h-8 rounded-full p-1 transition ${enabled ? "bg-emerald-600" : "bg-stone-300"} disabled:opacity-50`}
        >
          <span className={`block w-6 h-6 rounded-full bg-white shadow transition ${enabled ? "translate-x-6 rtl:-translate-x-6" : ""}`} />
        </button>
      </section>

      {stats.top.length > 0 && (
        <section className="p-5 rounded-2xl bg-white border border-line">
          <h2 className="font-extrabold mb-2 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-gold" aria-hidden />
            {t.trvBoard}
          </h2>
          <ol className="space-y-1 text-sm">
            {stats.top.map((b, i) => (
              <li key={b.table + i} className="flex justify-between">
                <span>
                  {i + 1}. <bdi>{b.table}</bdi>
                </span>
                <span className="font-bold tabular-nums">{b.points.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="p-5 rounded-2xl bg-white border border-line space-y-3">
        <h2 className="font-extrabold text-lg">{t.trvHouse}</h2>
        <p className="text-xs text-stone-600">{t.trvHouseHint}</p>
        {questions.length === 0 && !editing && <p className="text-sm text-stone-500">{t.trvNoHouse}</p>}
        <ul className="space-y-2">
          {questions.map((q) =>
            editing?.id === q.id ? null : (
              <li key={q.id} className={`p-3 rounded-xl border border-line flex items-start justify-between gap-3 ${q.active ? "" : "opacity-50"}`}>
                <span className="min-w-0">
                  <span className="font-bold block">{q.text[locale] || q.text.en}</span>
                  <span className="text-xs text-emerald-700">
                    ✓ {q.options[q.correct][locale] || q.options[q.correct].en}
                  </span>
                </span>
                {owner && (
                  <button type="button" onClick={() => setEditing(q)} className="px-3 py-1.5 rounded-lg border border-line text-xs font-bold shrink-0">
                    {t.edit}
                  </button>
                )}
              </li>
            ),
          )}
        </ul>
        {editing ? (
          <QuestionForm
            t={t}
            q={editing}
            onCancel={() => setEditing(null)}
            onDelete={
              editing.id
                ? async () => {
                    if (!confirm(t.trvDeleteQ)) return;
                    await post(null, "DELETE", `?id=${editing.id}`);
                    setEditing(null);
                    void reload();
                  }
                : undefined
            }
            onSave={async (q) => {
              const ok = await post({ id: q.id || undefined, text: q.text, options: q.options, correct: q.correct, active: q.active });
              if (!ok) return setMsg(t.trvInvalid);
              setMsg(null);
              setEditing(null);
              void reload();
            }}
          />
        ) : (
          owner && (
            <button type="button" onClick={() => setEditing(blank())} className="w-full py-2.5 rounded-xl border-2 border-dashed border-line text-sm font-bold text-stone-600 flex items-center justify-center gap-1.5 hover:border-ink">
              <Plus className="w-4 h-4" aria-hidden />
              {t.trvAddQ}
            </button>
          )
        )}
      </section>
    </main>
  );
}

function QuestionForm({ t, q, onSave, onCancel, onDelete }: { t: Dict; q: HouseQuestion; onSave: (q: HouseQuestion) => void; onCancel: () => void; onDelete?: () => void }) {
  const [v, setV] = useState<HouseQuestion>(q);
  const setText = (k: "en" | "ar" | "ur", s: string) => setV((x) => ({ ...x, text: { ...x.text, [k]: s.slice(0, 160) } }));
  const setOpt = (i: number, k: "en" | "ar" | "ur", s: string) => setV((x) => ({ ...x, options: x.options.map((o, j) => (j === i ? { ...o, [k]: s.slice(0, 60) } : o)) }));
  const valid = v.text.en.trim().length >= 3 && v.options.every((o) => o.en.trim());
  return (
    <div className="p-4 rounded-xl border border-ink bg-cream space-y-3">
      <div className="grid gap-2">
        <input value={v.text.en} onChange={(e) => setText("en", e.target.value)} placeholder={t.trvQEn} aria-label={t.trvQEn} className={field} />
        <div className="grid sm:grid-cols-2 gap-2">
          <input dir="rtl" value={v.text.ar} onChange={(e) => setText("ar", e.target.value)} placeholder={t.trvQAr} aria-label={t.trvQAr} className={field} />
          <input dir="rtl" value={v.text.ur} onChange={(e) => setText("ur", e.target.value)} placeholder={t.trvQUr} aria-label={t.trvQUr} className={field} />
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-extrabold text-stone-500 mb-1">{t.trvOptions}</legend>
        {v.options.map((o, i) => (
          <div key={i} className={`grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_1fr_1fr] gap-2 items-center p-2 rounded-lg ${v.correct === i ? "bg-emerald-50 ring-1 ring-emerald-500" : ""}`}>
            <label className="flex items-center gap-1 text-sm font-extrabold" title={t.trvCorrect}>
              <input type="radio" name="correct" checked={v.correct === i} onChange={() => setV((x) => ({ ...x, correct: i }))} aria-label={`${t.trvCorrect} ${LETTERS[i]}`} />
              {LETTERS[i]}
            </label>
            <input value={o.en} onChange={(e) => setOpt(i, "en", e.target.value)} placeholder="English" aria-label={`${LETTERS[i]} English`} className={field} />
            <input dir="rtl" value={o.ar} onChange={(e) => setOpt(i, "ar", e.target.value)} placeholder="عربي" aria-label={`${LETTERS[i]} Arabic`} className={`${field} col-start-2 sm:col-start-auto`} />
            <input dir="rtl" value={o.ur} onChange={(e) => setOpt(i, "ur", e.target.value)} placeholder="اردو" aria-label={`${LETTERS[i]} Urdu`} className={`${field} col-start-2 sm:col-start-auto`} />
          </div>
        ))}
        <p className="text-[11px] text-stone-500">{t.trvCorrectHint}</p>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-bold flex items-center gap-1.5">
          <input type="checkbox" checked={v.active} onChange={(e) => setV((x) => ({ ...x, active: e.target.checked }))} />
          {t.loyActive}
        </label>
        <span className="flex-1" />
        {onDelete && (
          <button type="button" onClick={onDelete} className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700">
            {t.delete}
          </button>
        )}
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-line text-xs font-bold bg-white">
          {t.cancel}
        </button>
        <button type="button" disabled={!valid} onClick={() => onSave(v)} className="px-4 py-1.5 rounded-lg bg-ink text-white text-xs font-bold disabled:opacity-40">
          {t.save}
        </button>
      </div>
    </div>
  );
}
