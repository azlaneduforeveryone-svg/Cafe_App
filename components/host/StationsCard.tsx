"use client";

import { useState } from "react";
import { ChefHat, Plus, Trash2 } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import type { Station } from "@/lib/types";

const input = "w-full px-2.5 py-2 rounded-lg bg-white border border-line text-sm focus:outline-none focus:ring-2 focus:ring-ember";

/** Kitchen stations (Tandoor, Curry, Drinks...). Each gets a column on the kitchen display. */
export function StationsCard({ t, initial, onSaved }: { t: Dict; initial: Station[]; onSaved: () => void }) {
  const [rows, setRows] = useState<Station[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const presets: Station[] = [
    { id: "tandoor", en: "Tandoor", ar: "التنور", ur: "تندور" },
    { id: "curry", en: "Curry", ar: "الكاري", ur: "سالن" },
    { id: "drinks", en: "Drinks", ar: "المشروبات", ur: "مشروبات" },
  ];
  const set = (i: number, k: keyof Station, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const newId = () => {
    let n = rows.length + 1;
    while (rows.some((r) => r.id === `station-${n}`)) n++;
    return `station-${n}`;
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/host/stations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stations: rows }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setMsg({ ok: true, text: t.saved });
      onSaved();
    } else setMsg({ ok: false, text: t.allLanguagesRequired });
  }

  return (
    <section className="bg-white rounded-3xl border border-line shadow-sm p-5">
      <h2 className="font-extrabold text-sm flex items-center gap-1.5">
        <ChefHat className="w-4 h-4 text-ember" aria-hidden />
        {t.stationsTitle}
      </h2>
      <p className="text-xs text-stone-500 mt-0.5 mb-3">{t.stationsHelp}</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
            <input aria-label={t.nameEn} placeholder={t.nameEn} value={r.en} maxLength={20} dir="ltr" onChange={(e) => set(i, "en", e.target.value)} className={input} />
            <input aria-label={t.nameAr} placeholder={t.nameAr} value={r.ar} maxLength={20} dir="rtl" lang="ar" onChange={(e) => set(i, "ar", e.target.value)} className={input} />
            <input aria-label={t.nameUr} placeholder={t.nameUr} value={r.ur} maxLength={20} dir="rtl" lang="ur" onChange={(e) => set(i, "ur", e.target.value)} className={input} />
            <button type="button" aria-label={t.delete} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="p-2 rounded-lg text-stone-500 hover:text-red-700 hover:bg-red-50">
              <Trash2 className="w-4 h-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {rows.length === 0 ? (
          <button type="button" onClick={() => setRows(presets)} className="px-3 py-2 rounded-xl bg-ink text-white text-xs font-bold inline-flex items-center gap-1">
            <Plus className="w-4 h-4" aria-hidden />
            {t.stationsPresets}
          </button>
        ) : (
          rows.length < 8 && (
            <button type="button" onClick={() => setRows((rs) => [...rs, { id: newId(), en: "", ar: "", ur: "" }])} className="px-3 py-2 rounded-xl bg-white border border-line text-xs font-bold inline-flex items-center gap-1 hover:bg-stone-50">
              <Plus className="w-4 h-4" aria-hidden />
              {t.stationAdd}
            </button>
          )
        )}
        {dirty && (
          <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-ember text-white text-xs font-extrabold disabled:opacity-60">
            {busy ? t.saving : t.stationsSave}
          </button>
        )}
        {msg && <span className={`text-xs font-semibold ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
