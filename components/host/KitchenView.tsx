"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Flame } from "lucide-react";
import { useLive, useNow } from "@/components/useLive";
import { playChime, unlockAudio } from "@/lib/chime";
import { fmt, mmss, tr } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { KitchenSnapshot, KitchenTicket } from "@/lib/menu";
import type { Locale } from "@/lib/types";

/** Ticket age colours: normal, amber after 10 minutes, red after 18. */
const AMBER = 10 * 60;
const RED = 18 * 60;

/** High-contrast kitchen display: one column per station, oldest ticket first. */
export function KitchenView({ t, locale, initial, canAct = true }: { t: Dict; locale: Locale; initial: KitchenSnapshot; canAct?: boolean }) {
  const { data, gone, clockOffset, refresh } = useLive("/api/host/kitchen", initial);
  const now = useNow(clockOffset);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (gone) router.replace("/login");
  }, [gone, router]);

  const seen = useRef(data.tickets.length);
  useEffect(() => {
    if (data.tickets.length > seen.current) playChime();
    seen.current = data.tickets.length;
  }, [data.tickets.length]);

  // Columns: the restaurant's stations, plus "Kitchen" when any dish has no station.
  const columns = [...data.stations.map((s) => ({ id: s.id, name: s[locale] || s.en }))];
  if (data.tickets.some((tk) => !tk.station || !data.stations.some((s) => s.id === tk.station))) columns.push({ id: "", name: t.noStation });
  if (!columns.length) columns.push({ id: "", name: t.noStation });
  const known = new Set(data.stations.map((s) => s.id));
  const inColumn = (tk: KitchenTicket, col: string) => (col === "" ? !tk.station || !known.has(tk.station) : tk.station === col);

  async function ready(tk: KitchenTicket) {
    unlockAudio();
    setBusy(`${tk.orderId}:${tk.station}`);
    await fetch(`/api/host/kitchen/${tk.orderId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ station: tk.station }) }).catch(() => null);
    setBusy(null);
    void refresh();
  }

  return (
    <main className="flex-1 w-full bg-[#0F1115] text-stone-100 px-3 sm:px-5 py-5">
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(columns.length, 4)}, minmax(0, 1fr))` }}>
        {columns.map((col) => {
          const list = data.tickets.filter((tk) => inColumn(tk, col.id)).sort((a, b) => a.acceptedAt - b.acceptedAt);
          return (
            <section key={col.id || "kitchen"} className="min-w-0">
              <h2 className="flex items-center justify-between mb-3 px-1">
                <span className="text-lg font-extrabold tracking-wide uppercase">{col.name}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-sm font-bold">{list.length}</span>
              </h2>
              <div className="space-y-3">
                {list.length === 0 && <p className="text-sm text-stone-500 px-1">{t.kitchenEmpty}</p>}
                {list.map((tk) => {
                  const age = (now - tk.acceptedAt) / 1000;
                  const tone = age >= RED ? "border-red-500 bg-red-500/10" : age >= AMBER ? "border-amber-400 bg-amber-400/10" : "border-white/10 bg-[#181B20]";
                  const clock = age >= RED ? "text-red-400" : age >= AMBER ? "text-amber-300" : "text-stone-300";
                  const key = `${tk.orderId}:${tk.station}`;
                  return (
                    <article key={key} className={`rounded-2xl border-2 p-4 ${tone}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-2xl font-extrabold">{tk.where}</p>
                        <span className={`font-mono text-xl font-bold ltr ${clock}`} suppressHydrationWarning>
                          {mmss(age)}
                        </span>
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5">{tk.kind === "pre" ? t.preOrderTag : fmt(t.roundN, { n: tk.round })}</p>
                      <ul className="mt-3 space-y-2">
                        {tk.lines.map((l, i) => (
                          <li key={i} className="text-base leading-snug">
                            <span className="font-extrabold text-amber-300 ltr me-1.5">{l.qty}×</span>
                            <span className="font-bold">{tr(l, "name", locale)}</span>
                            {(l.portion || l.spice) && (
                              <span className="flex flex-wrap gap-1.5 mt-1">
                                {l.portion && <span className="px-2 py-0.5 rounded-md bg-white/10 text-xs font-bold">{l.portion[locale] || l.portion.en}</span>}
                                {l.spice && (
                                  <span className={`px-2 py-0.5 rounded-md text-xs font-bold inline-flex items-center gap-1 ${l.spice === "hot" ? "bg-red-600" : l.spice === "medium" ? "bg-orange-600" : "bg-emerald-700"}`}>
                                    <Flame className="w-3 h-3" aria-hidden />
                                    {(t as unknown as Record<string, string>)[`spice_${l.spice}`]}
                                  </span>
                                )}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {tk.note && <p className="mt-3 text-sm bg-amber-300/15 text-amber-200 rounded-lg px-2.5 py-1.5">{tk.note}</p>}
                      <button
                        type="button"
                        hidden={!canAct}
                        disabled={busy === key}
                        onClick={() => ready(tk)}
                        className="mt-4 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-base font-extrabold flex items-center justify-center gap-2"
                      >
                        <Check className="w-5 h-5" aria-hidden />
                        {t.markReady}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
