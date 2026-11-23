"use client";

import { useState } from "react";
import { BellRing, BookOpen, Check, Copy, Droplets, HandHelping, Lock, Receipt, ShoppingBag, Utensils, Wifi, X } from "lucide-react";
import { BillCard, BillSheet, ReceiptCard } from "./BillCard";
import { MenuSheet } from "./MenuSheet";
import { OrderProgress } from "./OrderProgress";
import { GuestFrame } from "./GuestFrame";
import { useLive } from "@/components/useLive";
import { fmt, tr } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { money } from "@/lib/pricing";
import type { TableGuestSnapshot } from "@/lib/tables";
import type { Locale } from "@/lib/types";

type AlertType = "water" | "napkins" | "bill" | "help";

/** Guest phone at a table: order from the menu, follow orders live, call the waiter, see Wi-Fi. */
export function TableGuest({ t, locale, initial }: { t: Dict; locale: Locale; initial: TableGuestSnapshot }) {
  const tableId = initial.table.id;
  const { data, gone, refresh } = useLive(`/api/table/${tableId}`, initial);
  const [showMenu, setShowMenu] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [billSheet, setBillSheet] = useState(false);
  const d = t as unknown as Record<string, string>;
  const open = data.open && !gone;
  const bill = data.bill;
  const billEndpoint = `/api/table/${tableId}/bill`;
  const paid = bill?.status === "paid";
  const pending = data.orders.find((o) => o.kind === "table" && o.status === "submitted") ?? null;

  async function call(type: AlertType) {
    const res = await fetch(`/api/table/${tableId}/alert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) }).catch(() => null);
    setServiceOpen(false);
    setNotice(res?.ok ? `${d[`al_${type}`]}: ${t.callSent}` : t.errorGeneric);
    window.setTimeout(() => setNotice(null), 4000);
    void refresh();
  }

  // Table closed after paying: the receipt and rating stay available for a few hours.
  if (!open && paid && bill && !gone) {
    return (
      <GuestFrame t={t} locale={locale} restaurant={data.restaurant}>
        <div className="flex-1 py-4">
          <ReceiptCard t={t} locale={locale} bill={bill} currency={data.currency} restaurant={data.restaurant} endpoint={billEndpoint} onChange={() => void refresh()} />
        </div>
      </GuestFrame>
    );
  }

  if (!open) {
    return (
      <GuestFrame t={t} locale={locale} restaurant={data.restaurant}>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-10 px-2">
          <span className="w-16 h-16 rounded-full bg-white border border-line flex items-center justify-center shadow-sm">
            <Lock className="w-7 h-7 text-ember" aria-hidden />
          </span>
          <h1 className="display text-2xl font-bold">{gone ? t.tableClosedTitle : t.tableScanTitle}</h1>
          <p className="text-sm text-stone-600 max-w-xs">{gone ? t.tableClosedBody : t.tableScanBody}</p>
        </div>
      </GuestFrame>
    );
  }

  const openAlerts = new Set(data.alerts.map((a) => a.type));
  const shown = data.orders.filter((o) => o.status !== "cancelled");

  return (
    <GuestFrame t={t} locale={locale} restaurant={data.restaurant}>
      <div className="flex-1 flex flex-col gap-4 py-4 pb-24">
        <div className="text-center space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-stone-500">{t.tableOrderTitle}</p>
          <h1 className="display text-3xl font-bold">{fmt(t.tableWelcome, { n: data.table.number })}</h1>
        </div>

        {notice && (
          <p role="status" className="text-center text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {notice}
          </p>
        )}

        {bill && <BillCard t={t} locale={locale} bill={bill} currency={data.currency} restaurant={data.restaurant} endpoint={billEndpoint} canRequest={!paid} onChange={() => void refresh()} />}

        {data.hasMenu && !paid && (
          <button
            type="button"
            onClick={() => setShowMenu(true)}
            className="w-full py-4 px-3 rounded-2xl bg-ember hover:bg-ember-dark text-white text-base font-extrabold flex items-center justify-center gap-2 shadow-lg"
          >
            <BookOpen className="w-5 h-5" aria-hidden />
            {pending ? t.updateTableOrder : t.orderMore}
          </button>
        )}

        {shown.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-stone-500">{t.yourOrders}</h2>
            {shown.map((o) => {
              const accepted = o.status === "accepted";
              return (
                <div key={o.id} className={`p-3.5 rounded-2xl border ${o.readyAt && !o.servedAt ? "bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300" : accepted ? "bg-white border-emerald-200" : "bg-white border-gold"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold flex items-center gap-1.5">
                      <ShoppingBag className="w-4 h-4 text-ember" aria-hidden />
                      {o.kind === "pre" ? t.preOrderTag : fmt(t.roundN, { n: o.round })}
                    </span>
                    <span className="text-xs font-extrabold ltr">{money(o.total, data.currency)}</span>
                  </div>
                  <div className="mt-2">
                    <OrderProgress t={t} order={o} />
                  </div>
                  <p className="text-[11px] text-stone-500 mt-2">{o.items.map((l) => `${l.qty}× ${tr(l, "name", locale)}`).join(locale === "en" ? ", " : "، ")}</p>
                  {o === pending && (
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/table/${tableId}/order`, { method: "DELETE" }).catch(() => null);
                        void refresh();
                      }}
                      className="mt-2 text-[11px] font-bold text-stone-500 hover:text-red-700 underline"
                    >
                      {t.cancelTableOrder}
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {data.wifi && <WifiCard t={t} ssid={data.wifi.ssid} password={data.wifi.password} />}
      </div>

      {/* Call waiter */}
      <div className="sticky bottom-4 flex justify-end px-1">
        {serviceOpen && (
          <div role="dialog" aria-label={t.callWaiter} className="absolute bottom-16 end-1 w-60 bg-white rounded-2xl border border-line shadow-2xl p-2 space-y-1">
            {(
              [
                ["water", Droplets],
                ["napkins", Utensils],
                ["bill", Receipt],
                ["help", HandHelping],
              ] as const
            ).map(([type, Icon]) => (
              <button
                key={type}
                type="button"
                disabled={openAlerts.has(type)}
                onClick={() => {
                  // With food approved, "bill" opens the real bill (split, tip, method) instead of a bare call.
                  if (type === "bill" && bill && bill.status === "open") {
                    setServiceOpen(false);
                    setBillSheet(true);
                  } else call(type);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-3 rounded-xl text-sm font-bold hover:bg-stone-100 disabled:opacity-60"
              >
                <span className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-ember" aria-hidden />
                  {d[`al_${type}`]}
                </span>
                {openAlerts.has(type) && <Check className="w-4 h-4 text-emerald-600" aria-hidden />}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          aria-expanded={serviceOpen}
          onClick={() => setServiceOpen((v) => !v)}
          className={`px-4 py-3.5 rounded-full shadow-2xl text-white text-sm font-extrabold flex items-center gap-2 ${openAlerts.size ? "bg-emerald-600" : "bg-ink"}`}
        >
          {serviceOpen ? <X className="w-5 h-5" aria-hidden /> : <BellRing className="w-5 h-5" aria-hidden />}
          {t.callWaiter}
        </button>
      </div>

      {billSheet && bill && (
        <BillSheet t={t} locale={locale} bill={bill} currency={data.currency} country={data.restaurant.country} endpoint={billEndpoint} onClose={() => setBillSheet(false)} onSent={() => void refresh()} />
      )}

      {showMenu && (
        <MenuSheet
          t={t}
          locale={locale}
          token=""
          mode="table"
          endpoints={{ menu: `/api/table/${tableId}/menu`, order: `/api/table/${tableId}/order` }}
          order={pending}
          onClose={() => setShowMenu(false)}
          onSent={() => void refresh()}
        />
      )}
    </GuestFrame>
  );
}

function WifiCard({ t, ssid, password }: { t: Dict; ssid: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="p-4 rounded-2xl bg-white border border-line flex items-center gap-3">
      <span className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center shrink-0">
        <Wifi className="w-5 h-5 text-ember" aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-stone-500">{t.wifiCard}</p>
        <p className="font-extrabold text-sm truncate ltr text-start">{ssid}</p>
        {password && <p className="text-xs text-stone-600 font-mono truncate ltr text-start">{password}</p>}
      </div>
      {password && (
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {}
          }}
          className="px-3 py-2 rounded-xl bg-ink text-white text-xs font-bold flex items-center gap-1"
        >
          {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
          {copied ? t.copied : t.copy}
        </button>
      )}
    </section>
  );
}
