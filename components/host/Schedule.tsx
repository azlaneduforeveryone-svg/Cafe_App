"use client";

import { useState } from "react";
import { Clock, Plus, Trash2 } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import type { Locale, MealPeriod } from "@/lib/types";

/** Mon 1, Tue 2, Wed 4, Thu 8, Fri 16, Sat 32, Sun 64 (same bits as the database). */
export const ALL_DAYS = 127;
const INTL: Record<Locale, string> = { en: "en-GB", ar: "ar", ur: "ur" };
/** ISO weekday 1-7 -> short name. 2024-01-01 was a Monday. */
export const dayShort = (iso: number, l: Locale) => new Intl.DateTimeFormat(INTL[l], { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, iso)));
const bit = (iso: number) => 1 << (iso - 1);

export const periodName = (p: MealPeriod, l: Locale) => p[l] || p.en;

/** "Mon, Wed · Lunch" style summary; empty string when the dish is served all day, every day. */
export function scheduleSummary(days: number, periods: string[], meal: MealPeriod[], l: Locale) {
  const names = meal.filter((p) => periods.includes(p.id)).map((p) => periodName(p, l));
  const dayPart =
    days === ALL_DAYS
      ? ""
      : [1, 2, 3, 4, 5, 6, 7]
          .filter((d) => days & bit(d))
          .map((d) => dayShort(d, l))
          .join(l === "en" ? ", " : "، ");
  return [dayPart, names.join(l === "en" ? ", " : "، ")].filter(Boolean).join(" · ");
}

export function SchedulePicker({
  t,
  locale,
  days,
  periods,
  meal,
  onChange,
}: {
  t: Dict;
  locale: Locale;
  days: number;
  periods: string[];
  meal: MealPeriod[];
  onChange: (days: number, periods: string[]) => void;
}) {
  const chip = (on: boolean) =>
    `px-2.5 py-1.5 rounded-lg text-xs font-bold border ${on ? "bg-ink text-white border-ink" : "bg-white text-stone-600 border-line hover:border-stone-400"}`;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold text-stone-500 mb-1.5">{t.scheduleDays}</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={days === ALL_DAYS} onClick={() => onChange(ALL_DAYS, periods)} className={chip(days === ALL_DAYS)}>
            {t.everyDay}
          </button>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const on = days !== ALL_DAYS && (days & bit(d)) !== 0;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  // From "every day", tapping a day selects only that day.
                  const base = days === ALL_DAYS ? 0 : days;
                  const next = base ^ bit(d);
                  onChange(next === 0 ? ALL_DAYS : next, periods);
                }}
                className={chip(on)}
              >
                {dayShort(d, locale)}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-bold text-stone-500 mb-1.5">{t.scheduleTimes}</p>
        {meal.length === 0 ? (
          <p className="text-[11px] text-stone-500">{t.scheduleNoTimes}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={periods.length === 0} onClick={() => onChange(days, [])} className={chip(periods.length === 0)}>
              {t.allDay}
            </button>
            {meal.map((p) => {
              const on = periods.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(days, on ? periods.filter((x) => x !== p.id) : [...periods, p.id])}
                  className={chip(on)}
                >
                  {periodName(p, locale)}{" "}
                  <span className="opacity-60 ltr">
                    {p.start}–{p.end}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const input = "w-full px-2.5 py-2 rounded-lg bg-white border border-line text-sm focus:outline-none focus:ring-2 focus:ring-ember";

/** The restaurant's meal times (Breakfast / Lunch / Dinner ...). Saved all together. */
export function MealTimesCard({ t, initial, onSaved }: { t: Dict; initial: MealPeriod[]; onSaved: () => void }) {
  const [rows, setRows] = useState<MealPeriod[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const newId = (base: string) => {
    let id = base;
    let n = 2;
    while (rows.some((r) => r.id === id)) id = `${base}-${n++}`;
    return id;
  };
  const presets: MealPeriod[] = [
    { id: "breakfast", en: "Breakfast", ar: "الفطور", ur: "ناشتہ", start: "07:00", end: "11:30" },
    { id: "lunch", en: "Lunch", ar: "الغداء", ur: "لنچ", start: "12:00", end: "16:00" },
    { id: "dinner", en: "Dinner", ar: "العشاء", ur: "ڈنر", start: "18:00", end: "01:00" },
  ];
  const set = (i: number, k: keyof MealPeriod, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/host/meal-periods", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periods: rows }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setMsg({ ok: true, text: t.mealSaved });
      onSaved();
    } else setMsg({ ok: false, text: t.badTime });
  }

  return (
    <section className="bg-white rounded-3xl border border-line shadow-sm p-5">
      <h2 className="font-extrabold text-sm flex items-center gap-1.5">
        <Clock className="w-4 h-4 text-ember" aria-hidden />
        {t.mealTimesTitle}
      </h2>
      <p className="text-xs text-stone-500 mt-0.5 mb-3">{t.mealTimesHelp}</p>
      {rows.length === 0 && <p className="text-xs text-stone-500 mb-3">{t.mealNone}</p>}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_8.5rem_8.5rem_auto] gap-2 items-end">
            <input aria-label={t.nameEn} value={r.en} maxLength={20} dir="ltr" lang="en" onChange={(e) => set(i, "en", e.target.value)} className={input} placeholder={t.nameEn} />
            <input aria-label={t.nameAr} value={r.ar} maxLength={20} dir="rtl" lang="ar" onChange={(e) => set(i, "ar", e.target.value)} className={input} placeholder={t.nameAr} />
            <input aria-label={t.nameUr} value={r.ur} maxLength={20} dir="rtl" lang="ur" onChange={(e) => set(i, "ur", e.target.value)} className={input} placeholder={t.nameUr} />
            <label className="block text-[11px] text-stone-500">
              <span className="block mb-0.5">{t.mealFrom}</span>
              <input type="time" value={r.start} onChange={(e) => set(i, "start", e.target.value)} className={`${input} ltr`} />
            </label>
            <label className="block text-[11px] text-stone-500">
              <span className="block mb-0.5">{t.mealTo}</span>
              <input type="time" value={r.end} onChange={(e) => set(i, "end", e.target.value)} className={`${input} ltr`} />
            </label>
            <button type="button" aria-label={t.delete} title={t.delete} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="p-2 rounded-lg text-stone-500 hover:text-red-700 hover:bg-red-50 justify-self-start">
              <Trash2 className="w-4 h-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {rows.length === 0 ? (
          <button type="button" onClick={() => setRows(presets)} className="px-3 py-2 rounded-xl bg-ink text-white text-xs font-bold inline-flex items-center gap-1">
            <Plus className="w-4 h-4" aria-hidden />
            {t.mealPresets}
          </button>
        ) : (
          rows.length < 6 && (
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, { id: newId("time"), en: "", ar: "", ur: "", start: "12:00", end: "15:00" }])}
              className="px-3 py-2 rounded-xl bg-white border border-line text-xs font-bold inline-flex items-center gap-1 hover:bg-stone-50"
            >
              <Plus className="w-4 h-4" aria-hidden />
              {t.mealAdd}
            </button>
          )
        )}
        {dirty && (
          <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-ember text-white text-xs font-extrabold disabled:opacity-60">
            {busy ? t.saving : t.mealSave}
          </button>
        )}
        {msg && <span className={`text-xs font-semibold ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
