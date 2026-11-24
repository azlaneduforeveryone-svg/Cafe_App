"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, ChefHat, Clock, Droplets, HandHelping, LayoutGrid, Plus, Printer, QrCode, Receipt, RefreshCw, Trash2, Users, Utensils, Wifi, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { BillStrip, MarkPaidModal, type PaidExtras } from "./MarkPaid";
import { can, type Permission } from "@/lib/permissions";
import type { PayMethod } from "@/lib/types";
import { useLive, useNow } from "@/components/useLive";
import { playChime, unlockAudio } from "@/lib/chime";
import { fmt, mmss, sectionName, tr } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { money } from "@/lib/pricing";
import type { FloorSnapshot, FloorTable, ServiceAlert, TableStatus } from "@/lib/tables";
import type { Locale } from "@/lib/types";

const STATUS_STYLE: Record<TableStatus, { card: string; badge: string }> = {
  available: { card: "border-line bg-white", badge: "bg-stone-100 text-stone-600" },
  ordering: { card: "border-sky-300 bg-sky-50/60", badge: "bg-sky-600 text-white" },
  eating: { card: "border-emerald-300 bg-emerald-50/60", badge: "bg-emerald-600 text-white" },
  bill: { card: "border-amber-400 bg-amber-50", badge: "bg-amber-500 text-ink" },
  paid: { card: "border-emerald-500 bg-white", badge: "bg-emerald-100 text-emerald-900" },
  help: { card: "border-red-500 bg-red-50 ring-4 ring-red-200", badge: "bg-red-600 text-white animate-pulse" },
};
const ALERT_ICON = { water: Droplets, napkins: Utensils, bill: Receipt, help: HandHelping } as const;
const input = "w-full px-2.5 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ember";

async function post(url: string, body?: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const out = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : { error: "network" };
  return { ok: !!res?.ok, error: out.error };
}

export function FloorView({ t, locale, initial }: { t: Dict; locale: Locale; initial: FloorSnapshot }) {
  const { data, gone, clockOffset, refresh } = useLive("/api/host/floor", initial);
  const now = useNow(clockOffset);
  const router = useRouter();
  const d = t as unknown as Record<string, string>;
  const [seating, setSeating] = useState<FloorTable | null>(null);
  const [paying, setPaying] = useState<FloorTable | null>(null);
  // Buttons follow the role; the server checks every action again.
  const may = (p: Permission) => can(data.viewer.role, p);
  const myId = data.viewer.id;
  const [managing, setManaging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (gone) router.replace("/login");
  }, [gone, router]);

  const alerts = data.tables.flatMap((tb) => tb.alerts.map((a) => ({ ...a, table: tb })));
  const pending = data.tables.flatMap((tb) => tb.orders.filter((o) => o.status === "submitted").map((o) => ({ ...o, table: tb })));

  const readyCount = data.tables.reduce((n, tb) => n + tb.orders.filter((o) => o.readyAt && !o.servedAt).length, 0);
  // Chime when a new order, a call or food ready to serve arrives.
  const seen = useRef(alerts.length + pending.length + readyCount);
  useEffect(() => {
    const n = alerts.length + pending.length + readyCount;
    if (n > seen.current) playChime();
    seen.current = n;
  }, [alerts.length, pending.length, readyCount]);

  const show = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((c) => (c === msg ? null : c)), 3000);
  };
  const errText = (code?: string) =>
    code === "table_busy" ? t.errTableBusy : code === "duplicate_table" ? t.errDuplicateTable : code === "empty_bill" ? t.billErr_empty_bill : t.errorGeneric;
  async function run(url: string, body?: unknown, method?: string) {
    unlockAudio();
    const r = await post(url, body, method);
    if (!r.ok) show(errText(r.error));
    void refresh();
    return r.ok;
  }

  async function pay(sessionId: string, method: PayMethod, extras: PaidExtras) {
    const res = await fetch("/api/host/bills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, method, ...extras }) }).catch(() => null);
    const out = res ? ((await res.json().catch(() => ({}))) as { error?: string; receiptNo?: number; loyaltyError?: string | null }) : { error: "network" };
    if (!res?.ok) show(errText(out.error));
    else show(fmt(t.toastPaidTable, { r: out.receiptNo ?? "" }) + (out.loyaltyError ? ` · ${d[`loyErr_${out.loyaltyError}`] ?? t.loyErr_server_error}` : ""));
    void refresh();
    return !!res?.ok;
  }

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6 space-y-5">
      {/* Shift header */}
      <div className={`grid grid-cols-2 gap-3 ${data.kpis.revenueToday === null ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
        <Kpi label={t.kpiActiveTables} value={`${data.kpis.activeTables}/${data.kpis.totalTables}`} />
        <Kpi label={t.kpiOrdersToday} value={String(data.kpis.ordersToday)} />
        {data.kpis.revenueToday !== null && <Kpi label={t.kpiRevenueToday} value={money(data.kpis.revenueToday, data.currency)} />}
        <Kpi label={t.kpiRatingToday} value={data.kpis.ratingToday === null ? "–" : `${data.kpis.ratingToday} ★ (${data.kpis.ratingsToday})`} />
        {may("tables.manage") && (
        <div className="bg-white rounded-2xl border border-line p-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setManaging(true)} className="px-3 py-2 rounded-xl bg-ink text-white text-xs font-bold inline-flex items-center gap-1.5">
            <LayoutGrid className="w-4 h-4" aria-hidden />
            {t.manageTables}
          </button>
          <Link href="/dashboard/floor/qr" className="px-3 py-2 rounded-xl bg-cream border border-line text-xs font-bold inline-flex items-center gap-1.5">
            <Printer className="w-4 h-4" aria-hidden />
            {t.printQr}
          </Link>
        </div>
        )}
      </div>

      {/* Calls */}
      {alerts.length > 0 && (
        <section className="flex flex-wrap gap-2" aria-label={t.callWaiter}>
          {alerts
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((a) => {
              const Icon = ALERT_ICON[a.type];
              return (
                <div key={a.id} className="flex items-center gap-2 ps-3 pe-1.5 py-1.5 rounded-full bg-red-600 text-white shadow-lg animate-pulse">
                  <Icon className="w-4 h-4" aria-hidden />
                  <span className="text-sm font-extrabold">
                    {a.table.number} · {d[`al_${a.type}`]}
                  </span>
                  <span className="text-xs font-mono ltr" suppressHydrationWarning>
                    {mmss((now - a.createdAt) / 1000)}
                  </span>
                  <button type="button" onClick={() => run(`/api/host/floor/alerts/${a.id}`, { action: "resolve" })} className="px-2.5 py-1 rounded-full bg-white text-red-700 text-xs font-extrabold">
                    {t.resolve}
                  </button>
                </div>
              );
            })}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-12 items-start">
        {/* Approval queue */}
        <section className="lg:col-span-4 space-y-3 lg:order-2">
          <h2 className="font-extrabold text-sm flex items-center gap-2">
            <ChefHat className="w-4 h-4 text-ember" aria-hidden />
            {t.approvalTitle}
            {pending.length > 0 && <span className="px-2 rounded-full bg-red-600 text-white text-xs">{pending.length}</span>}
          </h2>
          {pending.length === 0 ? (
            <p className="bg-white rounded-2xl border border-line p-5 text-sm text-stone-500 text-center">{t.approvalEmpty}</p>
          ) : (
            pending
              .sort((a, b) => a.createdAt - b.createdAt)
              .map((o) => (
                <article key={o.id} className="bg-white rounded-2xl border-2 border-gold p-3.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-extrabold">
                      {o.table.number} <span className="text-xs text-stone-500 font-bold">· {o.kind === "pre" ? t.preOrderTag : fmt(t.roundN, { n: o.round })}</span>
                    </p>
                    <span className="text-xs font-mono text-stone-500 ltr" suppressHydrationWarning>
                      {mmss((now - o.updatedAt) / 1000)}
                    </span>
                  </div>
                  <ul className="mt-2 text-sm space-y-0.5">
                    {o.items.map((l) => (
                      <li key={l.id} className="flex justify-between gap-2">
                        <span>
                          <b className="ltr">{l.qty}×</b> {tr(l, "name", locale)}
                        </span>
                        <span className="text-xs text-stone-500 ltr">{money(l.qty * l.price, data.currency)}</span>
                      </li>
                    ))}
                  </ul>
                  {o.note && <p className="mt-2 text-xs bg-cream rounded-lg px-2 py-1.5">{o.note}</p>}
                  {may("orders.table") && (
                  <div className="flex justify-end gap-2 mt-3">
                    <button type="button" onClick={() => run(`/api/host/orders/${o.id}`, { action: "cancel" })} className="px-3 py-2 rounded-lg text-xs font-bold text-stone-600 hover:bg-red-50 hover:text-red-700">
                      {t.rejectOrder}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (await run(`/api/host/orders/${o.id}`, { action: "accept" })) show(`${o.table.number}: ${t.sendToKitchen}`);
                      }}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold"
                    >
                      {t.sendToKitchen}
                    </button>
                  </div>
                  )}
                </article>
              ))
          )}
          {may("tables.manage") && <WifiForm t={t} initial={data.wifi} onSaved={refresh} />}
        </section>

        {/* Floor grid */}
        <section className="lg:col-span-8 lg:order-1">
          {data.tables.length === 0 ? (
            <div className="bg-white rounded-3xl border border-line p-10 text-center space-y-3">
              <p className="text-sm text-stone-500">{t.noTablesYet}</p>
              {may("tables.manage") && (
                <button type="button" onClick={() => setManaging(true)} className="px-4 py-2.5 rounded-xl bg-ember text-white text-xs font-extrabold inline-flex items-center gap-1.5">
                  <Plus className="w-4 h-4" aria-hidden />
                  {t.addTable}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {data.tables.map((tb) => (
                <TableCard
                  key={tb.id}
                  t={t}
                  tb={tb}
                  now={now}
                  currency={data.currency}
                  sectionLabel={tb.sectionId ? sectionName(data.sections, tb.sectionId, locale) : ""}
                  onSeat={() => setSeating(tb)}
                  onOpen={() => run(`/api/host/floor/tables/${tb.id}`, { action: "open" })}
                  onClose={() => run(`/api/host/floor/tables/${tb.id}`, { action: "close" })}
                  onResolve={(a) => run(`/api/host/floor/alerts/${a.id}`, { action: "resolve" })}
                  onServed={(id) => run(`/api/host/orders/${id}`, { action: "served" })}
                  onPay={() => setPaying(tb)}
                  may={may}
                  mine={!!tb.staffId && tb.staffId === myId}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {paying && (
        <MarkPaidModal
          t={t}
          title={fmt(t.markPaidTitle, { n: paying.number })}
          country={data.country}
          currency={data.currency}
          bill={paying.bill?.status === "requested" ? paying.bill : null}
          fallbackTotal={paying.orders.filter((o) => o.status === "accepted").reduce((n, o) => n + o.total, 0)}
          locale={locale}
          loyaltyMode={data.loyaltyMode}
          target={{ sessionId: paying.session?.id }}
          onConfirm={(method, extras) => (paying.session ? pay(paying.session.id, method, extras) : Promise.resolve(false))}
          onClose={() => setPaying(null)}
        />
      )}

      {seating && (
        <Modal title={fmt(t.seatPick, { n: seating.number })} onClose={() => setSeating(null)} closeLabel={t.close}>
          {data.waiting.length === 0 ? (
            <p className="text-sm text-stone-500">{t.noWaiting}</p>
          ) : (
            <ul className="space-y-2">
              {data.waiting.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={async () => {
                      const tb = seating;
                      setSeating(null);
                      await run(`/api/host/floor/tables/${tb.id}`, { action: "seat", entryId: e.id });
                    }}
                    className="w-full p-3 rounded-xl border border-line hover:border-ember hover:bg-amber-50/50 flex items-center justify-between gap-2 text-start"
                  >
                    <span className="font-bold text-sm">
                      <span className="text-ember ltr">#{e.ticketNumber}</span> {e.name}
                      {e.status === "notified" && <BellRing className="inline w-3.5 h-3.5 ms-1 text-emerald-600" aria-hidden />}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-stone-500">
                      {e.hasPreOrder && <span className="px-1.5 py-0.5 rounded bg-gold/20 text-amber-900 font-bold">{t.preOrderTag}</span>}
                      <Users className="w-3.5 h-3.5" aria-hidden />
                      {e.partySize}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {managing && <ManageTables t={t} locale={locale} sections={data.sections} tables={data.tables} staff={data.staff} onClose={() => setManaging(false)} run={run} />}

      {toast && (
        <div className="fixed bottom-5 inset-x-0 z-50 flex justify-center px-4 pointer-events-none" role="status" aria-live="polite">
          <div className="bg-ink text-white px-4 py-2.5 rounded-full shadow-2xl text-sm font-semibold">{toast}</div>
        </div>
      )}
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-line p-3">
      <p className="text-[11px] font-bold text-stone-500">{label}</p>
      <p className="text-2xl font-extrabold mt-0.5 ltr text-start">{value}</p>
    </div>
  );
}

function TableCard({
  t,
  tb,
  now,
  currency,
  sectionLabel,
  onSeat,
  onOpen,
  onClose,
  onResolve,
  onServed,
  onPay,
  may,
  mine,
}: {
  t: Dict;
  tb: FloorTable;
  now: number;
  currency: string;
  sectionLabel: string;
  onSeat: () => void;
  onOpen: () => void;
  onClose: () => void;
  onResolve: (a: ServiceAlert) => void;
  onServed: (orderId: string) => void;
  onPay: () => void;
  may: (p: Permission) => boolean;
  /** Assigned to the person looking (waiters see theirs highlighted). */
  mine: boolean;
}) {
  const d = t as unknown as Record<string, string>;
  const st = STATUS_STYLE[tb.status];
  const [confirm, setConfirm] = useState(false);
  const total = tb.orders.filter((o) => o.status === "accepted").reduce((s, o) => s + o.total, 0);
  return (
    <article className={`rounded-2xl border-2 p-3 flex flex-col gap-2 min-h-40 ${st.card}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="display text-2xl font-extrabold leading-none">{tb.number}</p>
          <p className="text-[11px] text-stone-500 mt-1 flex flex-wrap items-center gap-x-1">
            <Users className="w-3 h-3" aria-hidden />
            {tb.capacity}
            {sectionLabel && <span>· {sectionLabel}</span>}
            {tb.staffName && <span className={mine ? "font-extrabold text-ember" : ""}>· {mine ? `${tb.staffName} (${t.mineLbl})` : tb.staffName}</span>}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${st.badge}`}>{d[`tst_${tb.status}`]}</span>
      </div>

      {tb.session && (
        <div className="text-xs text-stone-600 space-y-0.5">
          <p className="font-bold truncate">
            {tb.session.guestName || t.openedByQr}
            {tb.session.partySize ? ` · ${tb.session.partySize}` : ""}
          </p>
          <p className="flex items-center gap-1" suppressHydrationWarning>
            <Clock className="w-3 h-3" aria-hidden />
            {fmt(t.minAgo, { m: Math.max(0, Math.round((now - tb.session.openedAt) / 60_000)) })}
            {total > 0 && <span className="font-bold text-ink ltr ms-1">{money(total, currency)}</span>}
          </p>
        </div>
      )}

      {tb.alerts.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => may("floor.alerts") && onResolve(a)}
          disabled={!may("floor.alerts")}
          title={t.resolve}
          className="flex items-center justify-between gap-1 px-2 py-1 rounded-lg bg-red-600 text-white text-[11px] font-extrabold animate-pulse"
        >
          <span>{d[`al_${a.type}`]}</span>
          <span className="font-mono ltr" suppressHydrationWarning>
            {mmss((now - a.createdAt) / 1000)}
          </span>
        </button>
      ))}
      {tb.orders
        .filter((o) => o.readyAt && !o.servedAt)
        .map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onServed(o.id)}
            hidden={!may("orders.serve")}
            className="flex items-center justify-between gap-1 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-extrabold"
          >
            <span>{t.readyToServe}</span>
            <span>{t.markServed} ✓</span>
          </button>
        ))}
      {tb.bill && <BillStrip t={t} bill={tb.bill} currency={currency} />}
      {tb.orders.some((o) => o.status === "submitted") && (
        <p className="text-[11px] font-extrabold text-amber-800 flex items-center gap-1">
          <ChefHat className="w-3 h-3" aria-hidden />
          {t.newOrder}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {tb.session ? (
          confirm ? (
            <>
              <button type="button" onClick={onClose} className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold">
                {t.closeTable}
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="px-2 py-1.5 rounded-lg text-[11px] font-bold text-stone-500" aria-label={t.cancel}>
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </>
          ) : (
            <>
            {may("bills.pay") && total > 0 && tb.bill?.status !== "paid" && (
              <button type="button" onClick={onPay} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">
                {t.markPaid}
              </button>
            )}
            {may("floor.tables") && (
              <button type="button" onClick={() => setConfirm(true)} title={t.closeTableConfirm} className="px-2.5 py-1.5 rounded-lg border border-line bg-white text-[11px] font-bold">
                {t.closeTable}
              </button>
            )}
            </>
          )
        ) : !may("floor.tables") ? null : (
          <>
            <button type="button" onClick={onSeat} className="px-2.5 py-1.5 rounded-lg bg-ink text-white text-[11px] font-bold">
              {t.seatParty}
            </button>
            <button type="button" onClick={onOpen} className="px-2.5 py-1.5 rounded-lg border border-line bg-white text-[11px] font-bold">
              {t.openTableBtn}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function WifiForm({ t, initial, onSaved }: { t: Dict; initial: { ssid: string; password: string }; onSaved: () => void }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const dirty = v.ssid !== initial.ssid || v.password !== initial.password;
  return (
    <form
      className="bg-white rounded-2xl border border-line p-4 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await post("/api/host/wifi", v, "PUT")).ok) {
          setSaved(true);
          window.setTimeout(() => setSaved(false), 2000);
          onSaved();
        }
      }}
    >
      <h3 className="font-extrabold text-sm flex items-center gap-1.5">
        <Wifi className="w-4 h-4 text-ember" aria-hidden />
        {t.wifiTitle}
      </h3>
      <p className="text-[11px] text-stone-500">{t.wifiHelp}</p>
      <input aria-label={t.wifiSsid} placeholder={t.wifiSsid} value={v.ssid} maxLength={64} onChange={(e) => setV({ ...v, ssid: e.target.value })} className={`${input} ltr`} />
      <input aria-label={t.wifiPassword} placeholder={t.wifiPassword} value={v.password} maxLength={64} onChange={(e) => setV({ ...v, password: e.target.value })} className={`${input} ltr`} />
      {(dirty || saved) && (
        <button type="submit" disabled={!dirty} className="px-3 py-2 rounded-lg bg-ember text-white text-xs font-bold disabled:opacity-60">
          {saved ? t.saved : t.save}
        </button>
      )}
    </form>
  );
}

function ManageTables({
  t,
  locale,
  sections,
  tables,
  staff,
  onClose,
  run,
}: {
  t: Dict;
  locale: Locale;
  sections: FloorSnapshot["sections"];
  tables: FloorTable[];
  staff: FloorSnapshot["staff"];
  onClose: () => void;
  run: (url: string, body?: unknown, method?: string) => Promise<boolean>;
}) {
  const blank = { number: "", capacity: "4", sectionId: sections[0]?.id ?? "", staffId: "" };
  const staffSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      <option value="">{t.unassigned}</option>
      {staff.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  );
  const [draft, setDraft] = useState(blank);
  const [edits, setEdits] = useState<Record<string, typeof blank>>({});
  return (
    <Modal title={t.manageTables} onClose={onClose} closeLabel={t.close} wide>
      <div className="space-y-2">
        <div className="hidden sm:grid grid-cols-[6rem_5rem_1fr_1fr_auto] gap-2 text-[11px] font-bold text-stone-500">
          <span>{t.tableNumberLbl}</span>
          <span>{t.capacityLbl}</span>
          <span>{t.section}</span>
          <span>{t.staffLbl}</span>
          <span />
        </div>
        {tables.map((tb) => {
          const v = edits[tb.id] ?? { number: tb.number, capacity: String(tb.capacity), sectionId: tb.sectionId, staffId: tb.staffId ?? "" };
          const changed = v.number !== tb.number || v.capacity !== String(tb.capacity) || v.sectionId !== tb.sectionId || v.staffId !== (tb.staffId ?? "");
          const set = (k: keyof typeof blank, val: string) => setEdits({ ...edits, [tb.id]: { ...v, [k]: val } });
          return (
            <div key={tb.id} className="grid grid-cols-2 sm:grid-cols-[6rem_5rem_1fr_1fr_auto] gap-2 items-center">
              <input aria-label={t.tableNumberLbl} value={v.number} maxLength={12} onChange={(e) => set("number", e.target.value)} className={`${input} font-extrabold`} />
              <input aria-label={t.capacityLbl} type="number" min={1} max={40} value={v.capacity} onChange={(e) => set("capacity", e.target.value)} className={`${input} ltr`} />
              <select aria-label="section" value={v.sectionId} onChange={(e) => set("sectionId", e.target.value)} className={input}>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s[locale] || s.en}
                  </option>
                ))}
              </select>
              {staffSelect(v.staffId, (val) => set("staffId", val), t.staffLbl)}
              <div className="flex items-center gap-1">
                {changed && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (await run(`/api/host/floor/tables/${tb.id}`, { ...v, capacity: Number(v.capacity) }, "PUT")) {
                        const next = { ...edits };
                        delete next[tb.id];
                        setEdits(next);
                      }
                    }}
                    className="px-2.5 py-2 rounded-lg bg-ember text-white text-xs font-bold"
                  >
                    {t.save}
                  </button>
                )}
                <button type="button" title={t.rotateQrHelp} aria-label={t.rotateQr} onClick={() => run(`/api/host/floor/tables/${tb.id}`, { action: "rotate_qr" })} className="p-2 rounded-lg text-stone-500 hover:bg-stone-100">
                  <RefreshCw className="w-4 h-4" aria-hidden />
                </button>
                <button type="button" title={t.delete} aria-label={t.delete} onClick={() => run(`/api/host/floor/tables/${tb.id}`, undefined, "DELETE")} className="p-2 rounded-lg text-stone-500 hover:text-red-700 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
        <form
          className="grid grid-cols-2 sm:grid-cols-[6rem_5rem_1fr_1fr_auto] gap-2 items-center pt-2 border-t border-line"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run("/api/host/floor/tables", { ...draft, capacity: Number(draft.capacity) })) setDraft({ ...blank, number: "" });
          }}
        >
          <input required placeholder={t.tableNumberLbl} value={draft.number} maxLength={12} onChange={(e) => setDraft({ ...draft, number: e.target.value })} className={`${input} font-extrabold`} />
          <input type="number" min={1} max={40} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} className={`${input} ltr`} />
          <select value={draft.sectionId} onChange={(e) => setDraft({ ...draft, sectionId: e.target.value })} className={input}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s[locale] || s.en}
              </option>
            ))}
          </select>
          {staffSelect(draft.staffId, (val) => setDraft({ ...draft, staffId: val }), t.staffLbl)}
          <button type="submit" className="px-3 py-2 rounded-lg bg-ink text-white text-xs font-bold inline-flex items-center gap-1">
            <Plus className="w-4 h-4" aria-hidden />
            {t.addTable}
          </button>
        </form>
        <p className="text-[11px] text-stone-500 flex items-center gap-1 pt-1">
          <QrCode className="w-3.5 h-3.5" aria-hidden />
          {t.rotateQrHelp}
        </p>
      </div>
    </Modal>
  );
}
