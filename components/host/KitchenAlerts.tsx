"use client";

import { useEffect, useRef } from "react";
import { Ban, BellRing, Check } from "lucide-react";
import { playChime } from "@/lib/chime";
import { fmt } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { InboxItem } from "@/lib/notify";

/** Kitchen notifications for the person looking: dish ready, or out of stock. Chimes on new ones. */
export function KitchenAlerts({ t, items, onDone }: { t: Dict; items: InboxItem[]; onDone: () => void }) {
  const seen = useRef<number>(items[0]?.id ?? 0);
  useEffect(() => {
    const newest = items[0]?.id ?? 0;
    if (newest > seen.current) playChime();
    seen.current = Math.max(seen.current, newest);
  }, [items]);
  if (!items.length) return null;

  async function read(ids?: number[]) {
    await fetch("/api/host/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { ids } : { all: true }) }).catch(() => null);
    onDone();
  }

  return (
    <section className="space-y-2" aria-label={t.kaTitle} aria-live="polite">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
          <BellRing className="w-3.5 h-3.5 text-ember" aria-hidden />
          {t.kaTitle}
        </p>
        {items.length > 1 && (
          <button type="button" onClick={() => void read()} className="text-xs font-bold text-stone-600 underline">
            {t.kaAllSeen}
          </button>
        )}
      </div>
      {items.map((n) => (
        <div key={n.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 ${n.kind === "ready" ? "border-emerald-500 bg-emerald-50" : "border-red-500 bg-red-50"}`}>
          {n.kind === "ready" ? <Check className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden /> : <Ban className="w-5 h-5 text-red-700 shrink-0" aria-hidden />}
          <p className="flex-1 min-w-0 text-sm">
            <b>{n.table ? `${n.table}: ` : ""}</b>
            {n.kind === "ready" ? fmt(t.kaReady, { items: n.body }) : fmt(t.kaOut, { dish: n.body })}
          </p>
          <button type="button" onClick={() => void read([n.id])} className="px-3 py-1.5 rounded-lg bg-ink text-white text-xs font-extrabold shrink-0">
            {t.kaGotIt}
          </button>
        </div>
      ))}
    </section>
  );
}
