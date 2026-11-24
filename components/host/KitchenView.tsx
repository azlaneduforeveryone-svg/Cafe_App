"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Flame, LogOut, X } from "lucide-react";
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
export interface DeviceDish {
  id: string;
  nameEn: string;
  nameAr: string;
  nameUr: string;
  station: string;
  inStock: boolean;
}
type DeviceSnapshot = KitchenSnapshot & { device?: string; dishes?: DeviceDish[] };

/**
 * mode "staff": the logged-in Kitchen page. mode "device": a locked kitchen display that can only
 * mark dishes ready and mark a dish out of stock (no prices, no other pages).
 */
export function KitchenView({ t, locale, initial, canAct = true, mode = "staff" }: { t: Dict; locale: Locale; initial: DeviceSnapshot; canAct?: boolean; mode?: "staff" | "device" }) {
  const device = mode === "device";
  const { data, gone, clockOffset, refresh } = useLive<DeviceSnapshot>(device ? "/api/kitchen-display" : "/api/host/kitchen", initial);
  const now = useNow(clockOffset);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [stockOpen, setStockOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState<DeviceDish | null>(null);

  useEffect(() => {
    if (gone) router.replace(device ? "/kitchen-display" : "/login");
  }, [gone, router, device]);

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
    if (device) {
      await fetch("/api/kitchen-display", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ready", orderId: tk.orderId, station: tk.station }) }).catch(() => null);
    } else {
      await fetch(`/api/host/kitchen/${tk.orderId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ station: tk.station }) }).catch(() => null);
    }
    setBusy(null);
    void refresh();
  }

  async function outOfStock(d: DeviceDish) {
    unlockAudio();
    setConfirmOut(null);
    await fetch("/api/kitchen-display", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "out", itemId: d.id }) }).catch(() => null);
    void refresh();
  }

  return (
    <main className="flex-1 w-full bg-[#0F1115] text-stone-100 px-3 sm:px-5 py-5">
      {device && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="text-sm text-stone-400 font-bold">
            {t.kdTitle} · <bdi>{data.device}</bdi>
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setStockOpen(true)} className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-extrabold inline-flex items-center gap-2">
              <Ban className="w-4 h-4" aria-hidden />
              {t.kdOutOfStock}
            </button>
            <a href="/login?next=/dashboard/kitchen" className="px-3 py-2.5 rounded-xl bg-white/10 text-stone-300 text-xs font-bold inline-flex items-center gap-1.5" title={t.kdExitHelp}>
              <LogOut className="w-4 h-4" aria-hidden />
              {t.kdExit}
            </a>
          </div>
        </div>
      )}
      {device && stockOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t.kdOutOfStock}>
          <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto bg-[#181B20] rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">{t.kdOutOfStock}</h2>
              <button type="button" onClick={() => setStockOpen(false)} aria-label={t.close} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <p className="text-sm text-stone-400">{t.kdOutHelp}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {(data.dishes ?? []).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={!d.inStock}
                  onClick={() => setConfirmOut(d)}
                  className={`px-4 py-3 rounded-xl text-start font-bold border-2 ${d.inStock ? "border-white/15 bg-white/5 hover:border-red-500" : "border-red-900 bg-red-950/50 text-red-300"}`}
                >
                  {tr(d, "name", locale)}
                  {!d.inStock && <span className="block text-xs font-bold">{t.kdIsOut}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {device && confirmOut && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-sm bg-[#181B20] rounded-3xl p-6 space-y-4 text-center">
            <p className="text-lg font-extrabold">{fmt(t.kdConfirmOut, { dish: tr(confirmOut, "name", locale) })}</p>
            <p className="text-sm text-stone-400">{t.kdConfirmOutHelp}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmOut(null)} className="py-3 rounded-xl bg-white/10 font-bold">
                {t.cancel}
              </button>
              <button type="button" onClick={() => void outOfStock(confirmOut)} className="py-3 rounded-xl bg-red-600 font-extrabold">
                {t.kdOutOfStock}
              </button>
            </div>
          </div>
        </div>
      )}
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
