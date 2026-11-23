"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, ChevronDown, Crown, Footprints, LayoutList, MessageSquare, Phone, Plus, QrCode, ShoppingBag, Users, UtensilsCrossed } from "lucide-react";
import { Modal } from "@/components/Modal";
import { BillStrip, MarkPaidModal } from "./MarkPaid";
import { useLive, useNow } from "@/components/useLive";
import { playChime, unlockAudio } from "@/lib/chime";
import { fmt, mmss, sectionName, tr } from "@/lib/format";
import { money } from "@/lib/pricing";
import { LOCALES, LOCALE_LABELS, type Dict } from "@/lib/i18n";
import type { HostAction, HostEntry, HostSnapshot, HostTable, Locale, Order, PayMethod } from "@/lib/types";

const input = "w-full px-3 py-2.5 rounded-xl border border-line text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ember";

export function HostDashboard({ t, locale, initial }: { t: Dict; locale: Locale; initial: HostSnapshot }) {
  const { data, connected, gone, clockOffset, refresh } = useLive("/api/host/snapshot", initial);
  const now = useNow(clockOffset);
  const { restaurant: r, entries, stats } = data;

  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [tab, setTab] = useState<"queue" | "tables">("queue");
  const [seating, setSeating] = useState<HostEntry | null>(null);
  const [paying, setPaying] = useState<HostTable | null>(null);
  const tables = data.tables ?? [];
  const newTableOrders = tables.reduce((n, tb) => n + tb.orders.filter((o) => o.kind === "table" && o.status === "submitted").length, 0);
  const seenNew = useRef(newTableOrders);
  // A chime when a seated guest sends a new order from the table.
  useEffect(() => {
    if (newTableOrders > seenNew.current) playChime();
    seenNew.current = newTableOrders;
  }, [newTableOrders]);

  const router = useRouter();
  // Logged out (or session expired): back to the login page.
  useEffect(() => {
    if (gone) router.replace("/login");
  }, [gone, router]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3500);
  }, []);

  async function act(e: HostEntry, action: HostAction) {
    unlockAudio();
    setPending(e.id);
    try {
      const res = await fetch(`/api/host/entries/${e.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.status === 402) {
        setLimitOpen(true);
      } else if (!res.ok) {
        showToast(t.errorGeneric);
      } else {
        if (action === "notify") playChime();
        void refresh();
        showToast(fmt(action === "notify" ? t.toastBuzzed : action === "seat" ? t.toastSeated : t.toastNoShow, { n: e.ticketNumber }));
      }
    } catch {
      showToast(t.errorGeneric);
    }
    setPending(null);
  }

  async function orderAct(e: { ticketNumber: number }, orderId: string | undefined, action: "accept" | "cancel" | "served") {
    if (!orderId) return;
    const res = await fetch(`/api/host/orders/${orderId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    showToast(res?.ok ? (action === "served" ? `#${e.ticketNumber} ${t.stage_served}` : fmt(action === "accept" ? t.toastOrderAccepted : t.toastOrderCancelled, { n: e.ticketNumber })) : t.errorGeneric);
    void refresh();
  }

  async function tableAct(tb: HostTable, body: { label?: string; close?: boolean }) {
    const res = await fetch(`/api/host/tables/${tb.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) showToast(t.errorGeneric);
    void refresh();
  }

  async function payAct(tb: HostTable, method: PayMethod) {
    const res = await fetch("/api/host/bills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: tb.id, method }) }).catch(() => null);
    const out = res ? ((await res.json().catch(() => ({}))) as { error?: string; receiptNo?: number }) : {};
    showToast(res?.ok ? fmt(t.toastPaid, { n: tb.ticketNumber, r: out.receiptNo ?? "" }) : out.error === "empty_bill" ? t.billErr_empty_bill : t.errorGeneric);
    void refresh();
    return !!res?.ok;
  }

  const totalGuests = entries.reduce((s, e) => s + e.partySize, 0);
  const atLimit = r.plan === "free" && r.alertsUsed >= r.freeLimit;
  const graceSec = r.gracePeriodMin * 60;

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6">
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Queue */}
        <section className="lg:col-span-8 space-y-4" aria-label={t.liveQueue}>
          <div role="tablist" className="inline-flex bg-white border border-line rounded-2xl p-1 shadow-sm">
            {(
              [
                ["queue", t.queueTab, entries.length, LayoutList],
                ["tables", t.tablesTab, tables.length, UtensilsCrossed],
              ] as const
            ).map(([key, label, n, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`relative px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 ${tab === key ? "bg-ink text-white" : "text-stone-600 hover:text-ink"}`}
              >
                <Icon className="w-4 h-4" aria-hidden />
                {label}
                <span className={`px-1.5 rounded-full text-[10px] ${tab === key ? "bg-white/20" : "bg-stone-100"}`}>{n}</span>
                {key === "tables" && newTableOrders > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center animate-pulse">
                    {newTableOrders}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === "tables" ? (
            <TablesPanel
              t={t}
              locale={locale}
              tables={tables}
              sections={r.sections}
              currency={r.currency}
              now={now}
              onOrder={(tb, id, action) => orderAct(tb, id, action)}
              onTable={tableAct}
              onPay={setPaying}
            />
          ) : (
          <div className="bg-white rounded-3xl border border-line shadow-xl overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-cream border-b border-line">
              <Kpi label={t.waitingParties} value={entries.length} />
              <Kpi label={t.totalGuests} value={totalGuests} accent />
              <Kpi label={t.avgWait} value={stats.avgWaitToday ?? "–"} unit={stats.avgWaitToday !== null ? t.min : undefined} />
              <Link href="/dashboard/billing" className="bg-white p-3 rounded-2xl border border-gold/60 hover:bg-amber-50/50 text-start transition-colors">
                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                  {r.plan === "pro" ? <Crown className="w-3 h-3" aria-hidden /> : <MessageSquare className="w-3 h-3" aria-hidden />}
                  {r.plan === "pro" ? t.proName : t.alertsUsed}
                </span>
                <span className="text-2xl font-extrabold text-ink">
                  {r.plan === "pro" ? "∞" : <span className="ltr">{`${r.alertsUsed}/${r.freeLimit}`}</span>}
                </span>
              </Link>
            </div>

            {r.plan === "free" && (
              <div className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs ${atLimit ? "bg-red-50 border-red-200" : "bg-amber-50/80 border-gold/30"}`}>
                <div className="flex items-center gap-2 flex-1 min-w-48">
                  <AlertTriangle className={`w-4 h-4 shrink-0 ${atLimit ? "text-red-600" : "text-ember"}`} aria-hidden />
                  <span className="font-bold text-ink">{atLimit ? t.limitTitle : t.alertsUsed}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-stone-200 overflow-hidden max-w-40" aria-hidden>
                    <div className={`h-full ${atLimit ? "bg-red-500" : "bg-ember"}`} style={{ width: `${Math.min(100, (r.alertsUsed / r.freeLimit) * 100)}%` }} />
                  </div>
                </div>
                <Link href="/dashboard/billing" className="font-extrabold text-ember hover:underline">
                  {t.upgrade}
                </Link>
              </div>
            )}

            <div className="p-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h1 className="font-extrabold text-sm text-ink flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-ping" : "bg-amber-500"}`} aria-hidden />
                  {t.liveQueue}
                  <span className={`text-[11px] font-semibold ${connected ? "text-emerald-700" : "text-amber-700"}`}>{connected ? t.live : t.reconnecting}</span>
                </h1>
                <button
                  type="button"
                  onClick={() => setWalkIn(true)}
                  className="px-3.5 py-2 rounded-xl bg-ember hover:bg-ember-dark text-white text-xs font-extrabold shadow-sm flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" aria-hidden />
                  {t.addWalkIn}
                </button>
              </div>

              {entries.length === 0 ? (
                <p className="py-14 text-center text-stone-500 text-sm">{t.emptyQueue}</p>
              ) : (
                <ul className="space-y-2.5">
                  {entries.map((e) => {
                    const notified = e.status === "notified";
                    const left = notified && e.notifiedAt ? graceSec - (now - e.notifiedAt) / 1000 : graceSec;
                    const overdue = notified && left <= 0;
                    return (
                      <li
                        key={e.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          overdue ? "bg-red-50/70 border-red-300" : notified ? "bg-emerald-50/80 border-emerald-400 shadow-sm" : "bg-white border-line"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-12 h-12 rounded-xl font-mono font-extrabold text-sm flex items-center justify-center shrink-0 ${
                              notified ? "bg-go text-white" : "bg-ink text-gold"
                            }`}
                          >
                            <span className="ltr">#{e.ticketNumber}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-extrabold text-sm text-ink truncate">{e.name}</span>
                              <Badge>{LOCALE_LABELS[e.lang]}</Badge>
                              <Badge>{e.source === "walkin" ? t.walkIn : t.viaQr}</Badge>
                              {e.onTheWay && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white inline-flex items-center gap-1">
                                  <Footprints className="w-3 h-3" aria-hidden />
                                  {t.onTheWay}
                                </span>
                              )}
                              {overdue && <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-600 text-white">{t.overdue}</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-stone-500">
                              <span className="inline-flex items-center gap-1 font-semibold text-stone-700">
                                <Users className="w-3.5 h-3.5 text-ember" aria-hidden />
                                {e.partySize}
                              </span>
                              <span aria-hidden>•</span>
                              <span>{sectionName(r.sections, e.sectionId, locale)}</span>
                              <span aria-hidden>•</span>
                              <span>
                                {t.waited} <span className="font-mono font-bold text-stone-700 ltr" suppressHydrationWarning>{mmss((now - e.joinedAt) / 1000)}</span>
                              </span>
                              {notified && (
                                <>
                                  <span aria-hidden>•</span>
                                  <span className={overdue ? "text-red-700 font-bold" : "text-emerald-700 font-bold"}>
                                    {t.graceLeft} <span className="font-mono ltr" suppressHydrationWarning>{mmss(left)}</span>
                                  </span>
                                </>
                              )}
                              {e.phone && (
                                <a href={`tel:${e.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline">
                                  <Phone className="w-3 h-3" aria-hidden />
                                  <span className="ltr">{e.phone}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            disabled={pending === e.id}
                            onClick={() => act(e, "notify")}
                            className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1 shadow-sm text-white disabled:opacity-60 ${
                              notified ? "bg-emerald-600 hover:bg-emerald-700" : "bg-ember hover:bg-ember-dark"
                            }`}
                          >
                            <Bell className="w-3.5 h-3.5" aria-hidden />
                            {notified ? t.buzzAgain : t.notify}
                          </button>
                          <button
                            type="button"
                            disabled={pending === e.id}
                            onClick={() => (data.hasTables ? setSeating(e) : act(e, "seat"))}
                            className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold disabled:opacity-60"
                          >
                            {t.seat}
                          </button>
                          <button
                            type="button"
                            disabled={pending === e.id}
                            onClick={() => act(e, "no_show")}
                            className="px-2.5 py-2 rounded-xl bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-700 text-xs font-bold disabled:opacity-60"
                          >
                            {t.noShow}
                          </button>
                        </div>
                        </div>
                        {e.order && (
                          <OrderPanel
                            t={t}
                            locale={locale}
                            order={e.order}
                            currency={r.currency}
                            onAction={(action) => orderAct(e, e.order?.id, action)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          )}
        </section>

        {/* Side panel */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="bg-ink text-cream rounded-3xl p-5 shadow-xl">
            <span className="text-[11px] uppercase tracking-wider font-bold text-gold">{t.nowServing}</span>
            <div className="display text-5xl font-extrabold mt-1">
              <span className="ltr">#{r.nowServing || "–"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="bg-ink-2 rounded-2xl p-3 border border-stone-700">
                <span className="text-[11px] text-stone-400 block">{t.seatedToday}</span>
                <span className="text-xl font-extrabold">{stats.seatedToday}</span>
              </div>
              <div className="bg-ink-2 rounded-2xl p-3 border border-stone-700">
                <span className="text-[11px] text-stone-400 block">{t.noShowsToday}</span>
                <span className="text-xl font-extrabold">{stats.noShowToday}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-line p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-ember" aria-hidden />
              <h2 className="font-extrabold text-sm">{t.qrTitle}</h2>
            </div>
            <p className="text-xs text-stone-500">{t.qrBody}</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/settings" className="px-3 py-2 rounded-xl bg-ink hover:bg-stone-800 text-white text-xs font-bold">
                {t.manageQr}
              </Link>
              <a
                href={`/r/${r.slug}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl bg-cream border border-line hover:border-stone-400 text-ink text-xs font-bold"
              >
                {t.openGuestPage}
              </a>
            </div>
          </div>
        </aside>
      </div>

      {paying && (
        <MarkPaidModal
          t={t}
          title={fmt(t.markPaidTitleTicket, { n: paying.ticketNumber, name: paying.name })}
          country={r.country}
          currency={r.currency}
          bill={paying.bill?.status === "requested" ? paying.bill : null}
          fallbackTotal={paying.orders.filter((o) => o.status === "accepted").reduce((n, o) => n + o.total, 0)}
          onConfirm={(m) => payAct(paying, m)}
          onClose={() => setPaying(null)}
        />
      )}

      {seating && (
        <SeatModal
          t={t}
          locale={locale}
          entry={seating}
          tables={data.freeTables ?? []}
          sections={r.sections}
          onClose={() => setSeating(null)}
          onNoTable={async () => {
            const e = seating;
            setSeating(null);
            await act(e, "seat");
          }}
          onPick={async (tableId) => {
            const e = seating;
            setSeating(null);
            const res = await fetch(`/api/host/floor/tables/${tableId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "seat", entryId: e.id }),
            }).catch(() => null);
            showToast(res?.ok ? fmt(t.toastSeated, { n: e.ticketNumber }) : res?.status === 409 ? t.errTableBusy : t.errorGeneric);
            void refresh();
          }}
        />
      )}

      {walkIn && (
        <WalkInModal
          t={t}
          locale={locale}
          sections={r.sections}
          onClose={() => setWalkIn(false)}
          onAdded={(n, name) => {
            setWalkIn(false);
            void refresh();
            showToast(fmt(t.toastAdded, { n, name }));
          }}
        />
      )}

      {limitOpen && (
        <Modal title={t.limitTitle} onClose={() => setLimitOpen(false)} closeLabel={t.close} tone="gold">
          <p className="text-sm text-stone-600">{fmt(t.limitBody, { limit: r.freeLimit })}</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setLimitOpen(false)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100">
              {t.close}
            </button>
            <Link href="/dashboard/billing" className="px-5 py-2.5 rounded-xl bg-ember hover:bg-ember-dark text-white text-xs font-extrabold shadow inline-flex items-center gap-1.5">
              <Crown className="w-4 h-4" aria-hidden />
              {t.viewPlans}
            </Link>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-5 inset-x-0 z-50 flex justify-center px-4 pointer-events-none" role="status" aria-live="polite">
          <div className="bg-ink text-white border border-gold/50 px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden />
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}

function Kpi({ label, value, unit, accent }: { label: string; value: number | string; unit?: string; accent?: boolean }) {
  return (
    <div className="bg-white p-3 rounded-2xl border border-line">
      <span className="text-[11px] font-bold text-stone-500 block">{label}</span>
      <span className={`text-2xl font-extrabold ${accent ? "text-ember" : "text-ink"}`}>
        {value} {unit && <span className="text-xs font-bold">{unit}</span>}
      </span>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-stone-100 text-stone-600 border border-stone-200">{children}</span>;
}

function WalkInModal({
  t,
  locale,
  sections,
  onClose,
  onAdded,
}: {
  t: Dict;
  locale: Locale;
  sections: HostSnapshot["restaurant"]["sections"];
  onClose: () => void;
  onAdded: (ticketNumber: number, name: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setBusy(true);
    setError(false);
    const body = Object.fromEntries(new FormData(ev.currentTarget));
    const res = await fetch("/api/host/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (res?.ok) {
      const { ticketNumber, name } = (await res.json()) as { ticketNumber: number; name: string };
      onAdded(ticketNumber, name);
    } else {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <Modal title={t.walkInTitle} onClose={onClose} closeLabel={t.close}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block text-xs font-bold text-stone-700 mb-1">{t.guestName}</span>
          <input name="name" required maxLength={60} className={input} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-bold text-stone-700 mb-1">{t.partySize}</span>
            <select name="partySize" defaultValue="2" className={`${input} font-bold`}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n} {t.guests}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-stone-700 mb-1">{t.section}</span>
            <select name="sectionId" className={`${input} font-bold`}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s[locale] || s.en}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-stone-700 mb-1">{t.guestLanguage}</span>
            <select name="lang" defaultValue={locale} className={`${input} font-bold`}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-stone-700 mb-1">{t.phoneOptional}</span>
            <input name="phone" type="tel" dir="ltr" maxLength={20} className={input} />
          </label>
        </div>
        {error && <p className="text-sm text-red-700 font-semibold">{t.errorGeneric}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100">
            {t.cancel}
          </button>
          <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-xl bg-ember hover:bg-ember-dark disabled:opacity-60 text-white text-xs font-extrabold shadow">
            {t.addToQueue}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OrderPanel({
  t,
  locale,
  order,
  currency,
  title,
  onAction,
}: {
  t: Dict;
  locale: Locale;
  order: Order;
  currency: string;
  title?: string;
  onAction: (action: "accept" | "cancel" | "served") => void;
}) {
  const [open, setOpen] = useState(order.status === "submitted" || (!!order.readyAt && !order.servedAt));
  const count = order.items.reduce((n, l) => n + l.qty, 0);
  const accepted = order.status === "accepted";
  return (
    <div className={`mt-3 rounded-xl border ${accepted ? "border-emerald-300 bg-emerald-50/60" : "border-gold/60 bg-amber-50/70"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full px-3 py-2 flex items-center justify-between gap-2 text-start">
        <span className="flex items-center gap-2 text-xs font-extrabold text-ink">
          <ShoppingBag className="w-4 h-4 text-ember" aria-hidden />
          {title ?? t.preOrder}
          <span className="font-semibold text-stone-600">{fmt(t.preOrderSummary, { n: count, total: money(order.total, currency) })}</span>
          {accepted && !order.readyAt && <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold">{t.orderAccepted}</span>}
          {order.readyAt && !order.servedAt && <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold animate-pulse">{t.readyToServe}</span>}
          {order.servedAt && <span className="px-1.5 py-0.5 rounded bg-stone-200 text-stone-700 text-[10px] font-extrabold">{t.stage_served}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <ul className="text-xs space-y-1">
            {order.items.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span>
                  <span className="font-extrabold ltr">{l.qty}×</span> {tr(l, "name", locale)}
                </span>
                <span className="font-semibold text-stone-600 ltr">{money(l.price * l.qty, currency)}</span>
              </li>
            ))}
          </ul>
          {order.note && (
            <p className="text-xs bg-white/70 rounded-lg px-2 py-1.5 border border-line">
              <span className="font-bold">{t.orderNoteLabel}:</span> {order.note}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onAction("cancel")} className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-stone-600 hover:text-red-700 hover:bg-red-50">
              {t.cancelOrder}
            </button>
            {accepted && !order.servedAt && (
              <button type="button" onClick={() => onAction("served")} className="px-3 py-1.5 rounded-lg bg-ink text-white text-xs font-extrabold">
                {t.markServed} ✓
              </button>
            )}
            {!accepted && (
              <button type="button" onClick={() => onAction("accept")} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold">
                {t.acceptOrder}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TablesPanel({
  t,
  locale,
  tables,
  sections,
  currency,
  now,
  onOrder,
  onTable,
  onPay,
}: {
  t: Dict;
  locale: Locale;
  tables: HostTable[];
  sections: HostSnapshot["restaurant"]["sections"];
  currency: string;
  now: number;
  onOrder: (tb: HostTable, orderId: string, action: "accept" | "cancel" | "served") => void;
  onTable: (tb: HostTable, body: { label?: string; close?: boolean }) => void;
  onPay: (tb: HostTable) => void;
}) {
  const [closing, setClosing] = useState<string | null>(null);
  if (!tables.length) {
    return <div className="bg-white rounded-3xl border border-line shadow-xl p-10 text-center text-sm text-stone-500">{t.noTables}</div>;
  }
  // Tables with an order waiting for the kitchen first.
  const sorted = [...tables].sort((a, b) => {
    const pa = a.orders.some((o) => o.status === "submitted") ? 1 : 0;
    const pb = b.orders.some((o) => o.status === "submitted") ? 1 : 0;
    return pb - pa || b.seatedAt - a.seatedAt;
  });
  return (
    <ul className="space-y-3">
      {sorted.map((tb) => {
        const waiting = tb.orders.some((o) => o.status === "submitted");
        const total = tb.orders.filter((o) => o.status === "accepted").reduce((s, o) => s + o.total, 0);
        return (
          <li key={tb.id} className={`bg-white rounded-3xl border shadow-sm p-4 ${waiting ? "border-gold ring-2 ring-gold/40" : "border-line"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-extrabold text-sm flex flex-wrap items-center gap-2">
                  <span className="ltr text-ember">#{tb.ticketNumber}</span>
                  <span className="truncate">{tb.name}</span>
                  {waiting && <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-extrabold">{t.newOrder}</span>}
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5 flex flex-wrap gap-x-3">
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3 h-3" aria-hidden />
                    {tb.partySize}
                  </span>
                  <span>{sectionName(sections, tb.sectionId, locale)}</span>
                  <span suppressHydrationWarning>{fmt(t.seatedMinAgo, { m: Math.max(0, Math.round((now - tb.seatedAt) / 60_000)) })}</span>
                  {total > 0 && <span className="font-bold text-ink ltr">{fmt(t.tableTotal, { v: money(total, currency) })}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-stone-500">
                  {t.tableNo}
                  <input
                    key={tb.label}
                    defaultValue={tb.label}
                    maxLength={12}
                    onBlur={(ev) => ev.target.value.trim() !== tb.label && onTable(tb, { label: ev.target.value.trim() })}
                    onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
                    className="w-16 px-2 py-1.5 rounded-lg border border-line text-sm font-extrabold text-ink text-center"
                  />
                </label>
                {closing === tb.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setClosing(null);
                        onTable(tb, { close: true });
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold"
                    >
                      {t.closeTable}
                    </button>
                    <button type="button" onClick={() => setClosing(null)} className="px-2 py-1.5 rounded-lg text-xs font-bold text-stone-500 hover:bg-stone-100">
                      {t.cancel}
                    </button>
                  </span>
                ) : (
                  <>
                  {total > 0 && tb.bill?.status !== "paid" && (
                    <button type="button" onClick={() => onPay(tb)} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                      {t.markPaid}
                    </button>
                  )}
                  <button type="button" title={t.closeTableConfirm} onClick={() => setClosing(tb.id)} className="px-2.5 py-1.5 rounded-lg border border-line text-xs font-bold text-stone-600 hover:bg-stone-50">
                    {t.closeTable}
                  </button>
                  </>
                )}
              </div>
            </div>
            {tb.bill && (
              <div className="mt-3">
                <BillStrip t={t} bill={tb.bill} currency={currency} />
              </div>
            )}
            {tb.orders.map((o) => (
              <OrderPanel
                key={o.id}
                t={t}
                locale={locale}
                order={o}
                currency={currency}
                title={o.kind === "pre" ? t.preOrderTag : fmt(t.roundN, { n: o.round })}
                onAction={(action) => onOrder(tb, o.id, action)}
              />
            ))}
          </li>
        );
      })}
    </ul>
  );
}

/** Pick a free table: the guest's chosen section first, best fit for the party size at the top. */
function SeatModal({
  t,
  locale,
  entry,
  tables,
  sections,
  onClose,
  onPick,
  onNoTable,
}: {
  t: Dict;
  locale: Locale;
  entry: HostEntry;
  tables: HostSnapshot["freeTables"];
  sections: HostSnapshot["restaurant"]["sections"];
  onClose: () => void;
  onPick: (tableId: string) => void;
  onNoTable: () => void;
}) {
  // Tables big enough come first, smallest fitting table first; then too-small ones.
  const fit = (a: { capacity: number }, b: { capacity: number }) => {
    const fa = a.capacity >= entry.partySize ? 0 : 1;
    const fb = b.capacity >= entry.partySize ? 0 : 1;
    return fa - fb || (fa === 0 ? a.capacity - b.capacity : b.capacity - a.capacity);
  };
  const mine = tables.filter((x) => x.sectionId === entry.sectionId).sort(fit);
  const others = tables.filter((x) => x.sectionId !== entry.sectionId).sort(fit);
  const btn = (x: HostSnapshot["freeTables"][number], highlight: boolean) => (
    <button
      key={x.id}
      type="button"
      onClick={() => onPick(x.id)}
      className={`p-3 rounded-2xl border-2 text-start hover:border-ember ${highlight && x.capacity >= entry.partySize ? "border-emerald-400 bg-emerald-50/60" : "border-line bg-white"}`}
    >
      <span className="block text-xl font-extrabold">{x.number}</span>
      <span className={`block text-[11px] font-bold ${x.capacity >= entry.partySize ? "text-emerald-700" : "text-amber-700"}`}>
        <Users className="inline w-3 h-3 me-0.5" aria-hidden />
        {fmt(t.seatFits, { n: x.capacity })}
      </span>
      {!highlight && x.sectionId && <span className="block text-[10px] text-stone-500">{sectionName(sections, x.sectionId, locale)}</span>}
    </button>
  );
  return (
    <Modal title={fmt(t.seatAtTableTitle, { n: entry.ticketNumber, name: entry.name })} onClose={onClose} closeLabel={t.close}>
      <div className="space-y-4">
        <p className="text-xs text-stone-500 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" aria-hidden />
          {entry.partySize}
        </p>
        <section>
          <h3 className="text-xs font-extrabold text-stone-600 mb-2">{fmt(t.seatSectionFirst, { section: sectionName(sections, entry.sectionId, locale) })}</h3>
          {mine.length ? <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{mine.map((x) => btn(x, true))}</div> : <p className="text-sm text-stone-500">{t.seatNoFree}</p>}
        </section>
        {others.length > 0 && (
          <section>
            <h3 className="text-xs font-extrabold text-stone-600 mb-2">{t.seatOtherTables}</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{others.map((x) => btn(x, false))}</div>
          </section>
        )}
        <div className="flex justify-end pt-1">
          <button type="button" onClick={onNoTable} className="px-3 py-2 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100">
            {t.seatNoTable}
          </button>
        </div>
      </div>
    </Modal>
  );
}
