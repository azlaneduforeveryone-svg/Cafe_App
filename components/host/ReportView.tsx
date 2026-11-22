import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Info } from "lucide-react";
import { fmt, tr } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { money } from "@/lib/pricing";
import { totalsOf, type Alert, type Range, type Report, type Totals } from "@/lib/reports";
import type { Locale } from "@/lib/types";

// Chart colours: categorical slots 1-3 of the validated reference palette.
const C_SEATED = "#2a78d6";
const C_NOSHOW = "#eb6834";
const C_WALKED = "#1baf7a";

const INTL: Record<Locale, string> = { en: "en-GB", ar: "ar", ur: "ur" };

/** Weekday name for ISO weekday 1 (Monday) to 7 (Sunday). 2024-01-01 was a Monday. */
const dayName = (dow: number, l: Locale, style: "long" | "short" = "long") =>
  new Intl.DateTimeFormat(INTL[l], { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, dow)));
const dateLabel = (d: string, l: Locale) =>
  new Intl.DateTimeFormat(INTL[l], { day: "numeric", month: "short", timeZone: "UTC", calendar: "gregory", numberingSystem: "latn" }).format(new Date(d + "T00:00:00Z"));
/** Short numeric date for chart axes, e.g. 23/10. */
const axisDate = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
const pctOf = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);

export function ReportView({ t, locale, rep, alerts, today }: { t: Dict; locale: Locale; rep: Report; alerts: { alerts: Alert[]; from: string; to: string }; today: string }) {
  const al = alerts;
  const range = rep.range;
  const cur = rep.currency;
  const exportQs = `from=${range.from}&to=${range.to}`;
  return (
    <main className="flex-1 max-w-6xl w-full min-w-0 mx-auto px-3 sm:px-6 py-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display text-2xl font-bold">{t.reportsTitle}</h1>
            <p className="text-sm text-stone-500 mt-1 max-w-xl">{t.reportsSub}</p>
          </div>
          <div className="flex gap-2">
            <a href={`/api/host/reports/export?type=daily&${exportQs}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-ink text-cream hover:bg-ink-2">
              <Download className="w-3.5 h-3.5" aria-hidden /> {t.exportDaily}
            </a>
            <a href={`/api/host/reports/export?type=dishes&${exportQs}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-line hover:bg-stone-50">
              <Download className="w-3.5 h-3.5" aria-hidden /> {t.exportDishes}
            </a>
          </div>
        </div>

        <RangePicker t={t} range={range} today={today} />

        <AlertsCard t={t} locale={locale} alerts={al.alerts} from={al.from} to={al.to} />

        <p className="text-xs text-stone-500">
          {fmt(t.comparedWith, { from: dateLabel(rep.previous.from, locale), to: dateLabel(rep.previous.to, locale) })}
        </p>
        <Kpis t={t} c={rep.current} p={rep.prior} currency={cur} />

        {rep.current.parties === 0 ? (
          <div className="bg-white rounded-2xl border border-line p-8 text-center text-sm text-stone-500">{t.noData}</div>
        ) : (
          <>
            <DailyChart t={t} locale={locale} rep={rep} />
            <div className="grid gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3 min-w-0">
                <Heatmap t={t} locale={locale} heat={rep.heat} />
              </div>
              <div className="lg:col-span-2 min-w-0">
                <Dishes t={t} locale={locale} rep={rep} />
              </div>
            </div>
            <DailyTable t={t} locale={locale} rep={rep} />
          </>
        )}

        <p className="text-xs text-stone-500 leading-relaxed border-t border-line pt-4">{t.reportFoot}</p>
      </main>
  );
}

// ---------------------------------------------------------------------------

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-line p-4 sm:p-5 min-w-0">
      <h2 className="font-extrabold text-base">{title}</h2>
      {sub && <p className="text-xs text-stone-500 mt-0.5">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function RangePicker({ t, range, today }: { t: Dict; range: Range; today: string }) {
  const presets: [Range["key"], string][] = [
    ["7", t.range7],
    ["30", t.range30],
    ["90", t.range90],
    ["month", t.rangeMonth],
    ["lastmonth", t.rangeLastMonth],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav className="flex flex-wrap gap-1 bg-white border border-line rounded-xl p-1">
        {presets.map(([k, label]) => (
          <Link
            key={k}
            href={`/dashboard/reports?range=${k}`}
            aria-current={range.key === k ? "page" : undefined}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${range.key === k ? "bg-ember text-white" : "text-stone-600 hover:bg-stone-100"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form action="/dashboard/reports" className="flex flex-wrap items-center gap-1.5 text-xs">
        <input type="hidden" name="range" value="custom" />
        <label className="flex items-center gap-1">
          <span className="text-stone-500">{t.rangeFrom}</span>
          <input type="date" name="from" defaultValue={range.from} max={today} className="ltr border border-line rounded-lg px-2 py-1.5 bg-white" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-stone-500">{t.rangeTo}</span>
          <input type="date" name="to" defaultValue={range.to} max={today} className="ltr border border-line rounded-lg px-2 py-1.5 bg-white" />
        </label>
        <button className={`px-3 py-1.5 rounded-lg font-semibold border ${range.key === "custom" ? "bg-ember text-white border-ember" : "bg-white border-line hover:bg-stone-50"}`}>
          {t.rangeApply}
        </button>
      </form>
    </div>
  );
}

function alertText(t: Dict, l: Locale, a: Alert) {
  const p: Record<string, string | number> = { ...a.params };
  if (a.code === "dish_dropped") p.name = tr(a.params, "name", l);
  if (a.code === "wasted_orders") p.value = money(Number(a.params.value), String(a.params.currency));
  if (a.code === "busiest_time") {
    p.day = dayName(Number(a.params.dow), l);
    p.from = hh(Number(a.params.h));
    p.to = hh(Number(a.params.h) + 1);
  }
  const d = t as unknown as Record<string, string>;
  return { title: fmt(d[`alert_${a.code}_t`], p), body: fmt(d[`alert_${a.code}_b`], p) };
}

function AlertsCard({ t, locale, alerts, from, to }: { t: Dict; locale: Locale; alerts: Alert[]; from: string; to: string }) {
  const style = {
    warn: { box: "bg-amber-50 border-amber-300", icon: <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden /> },
    info: { box: "bg-sky-50 border-sky-200", icon: <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" aria-hidden /> },
    good: { box: "bg-emerald-50 border-emerald-200", icon: <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden /> },
  };
  return (
    <Card title={t.alertsTitle} sub={fmt(t.alertsPeriod, { from: dateLabel(from, locale), to: dateLabel(to, locale) })}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {alerts.map((a, i) => {
          const { title, body } = alertText(t, locale, a);
          return (
            <li key={i} className={`flex gap-2.5 rounded-xl border p-3 ${style[a.level].box}`}>
              {style[a.level].icon}
              <div>
                <p className="text-sm font-bold">{title}</p>
                <p className="text-xs text-stone-700 mt-0.5 leading-relaxed">{body}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Change arrow. `goodWhenUp` false means a rise is bad (waits, no-shows). */
function Delta({ now, before, goodWhenUp = true, points, t }: { now: number | null; before: number | null; goodWhenUp?: boolean; points?: boolean; t: Dict }) {
  if (now === null || before === null || (!points && before === 0)) return <span className="text-[11px] text-stone-400">{t.noPrior}</span>;
  const diff = points ? Math.round((now - before) * 100) : Math.round(((now - before) / before) * 100);
  if (diff === 0) return <span className="text-[11px] text-stone-400 ltr">±0{points ? " pts" : "%"}</span>;
  const good = diff > 0 === goodWhenUp;
  return (
    <span className={`text-[11px] font-bold ltr ${good ? "text-emerald-700" : "text-red-700"}`}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
      {points ? " pts" : "%"}
    </span>
  );
}

function Kpi({ label, value, extra, delta }: { label: string; value: string; extra?: string; delta: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-line p-3.5">
      <p className="text-[11px] font-bold text-stone-500">{label}</p>
      <p className="text-2xl font-extrabold mt-0.5 text-start">{value}</p>
      <div className="flex flex-wrap items-center justify-between gap-1 mt-1">
        {delta}
        {extra && <span className="text-[11px] text-stone-500">{extra}</span>}
      </div>
    </div>
  );
}

function Kpis({ t, c, p, currency }: { t: Dict; c: Totals; p: Totals; currency: string }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi label={t.kpiParties} value={String(c.parties)} extra={c.qrShare === null ? undefined : fmt(t.kpiQr, { p: Math.round(c.qrShare * 100) })} delta={<Delta t={t} now={c.parties} before={p.parties} />} />
      <Kpi label={t.kpiSeated} value={String(c.seated)} delta={<Delta t={t} now={c.seated} before={p.seated} />} />
      <Kpi label={t.kpiCovers} value={String(c.covers)} delta={<Delta t={t} now={c.covers} before={p.covers} />} />
      <Kpi label={t.kpiAvgWait} value={c.avgWait === null ? "–" : `${c.avgWait} ${t.min}`} delta={<Delta t={t} now={c.avgWait} before={p.avgWait} goodWhenUp={false} />} />
      <Kpi label={t.kpiNoShow} value={pctOf(c.noShowRate)} extra={String(c.noShows)} delta={<Delta t={t} now={c.noShowRate} before={p.noShowRate} goodWhenUp={false} points />} />
      <Kpi label={t.kpiWalked} value={pctOf(c.walkedRate)} extra={String(c.walked)} delta={<Delta t={t} now={c.walkedRate} before={p.walkedRate} goodWhenUp={false} points />} />
      <Kpi
        label={t.kpiPreOrderSales}
        value={money(c.preOrderSales, currency)}
        extra={c.wasted ? fmt(t.kpiWasted, { n: c.wasted, v: money(c.wastedValue, currency) }) : undefined}
        delta={<Delta t={t} now={c.preOrderSales} before={p.preOrderSales} />}
      />
      <Kpi
        label={t.kpiPreOrders}
        value={String(c.preOrders)}
        extra={[c.preOrderRate === null ? "" : fmt(t.kpiPreOrderRate, { p: Math.round(c.preOrderRate * 100) }), c.avgPreOrder === null ? "" : fmt(t.kpiAvgPreOrder, { v: money(c.avgPreOrder, currency) })]
          .filter(Boolean)
          .join(" · ")}
        delta={<Delta t={t} now={c.preOrders} before={p.preOrders} />}
      />
    </div>
  );
}

function Legend({ t }: { t: Dict }) {
  const items: [string, string][] = [
    [C_SEATED, t.legendSeated],
    [C_NOSHOW, t.legendNoShow],
    [C_WALKED, t.legendWalked],
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-stone-600">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} aria-hidden />
          {l}
        </span>
      ))}
    </div>
  );
}

function DailyChart({ t, locale, rep }: { t: Dict; locale: Locale; rep: Report }) {
  const days = rep.daily;
  const max = Math.max(1, ...days.map((d) => d.seated + d.noShow + d.walked));
  const step = Math.max(1, Math.ceil(days.length / 7)); // at most ~7 date labels, fits a phone
  const H = 160;
  return (
    <Card title={t.dailyTitle}>
      <Legend t={t} />
      <div className="mt-3 flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-stone-400 ltr text-end w-6 shrink-0" style={{ height: H }} aria-hidden>
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative flex items-end gap-[2px] border-b border-stone-300" style={{ height: H }} dir="ltr">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-stone-200" aria-hidden />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-stone-200" aria-hidden />
            {days.map((d) => {
              const total = d.seated + d.noShow + d.walked;
              const segs: [number, string][] = [
                [d.walked, C_WALKED],
                [d.noShow, C_NOSHOW],
                [d.seated, C_SEATED],
              ];
              return (
                <div key={d.d} className="group relative flex-1 h-full flex flex-col justify-end items-center min-w-0" tabIndex={0}>
                  <div className="w-full max-w-7 flex flex-col gap-[2px] justify-end" style={{ height: `${(total / max) * 100}%` }}>
                    {segs
                      .filter(([n]) => n > 0)
                      .map(([n, c], i) => (
                        <div key={i} className={i === 0 ? "rounded-t-[4px]" : ""} style={{ flexGrow: n, background: c, minHeight: 2 }} />
                      ))}
                  </div>
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full mb-1 z-10 hidden group-hover:block group-focus:block whitespace-nowrap rounded-lg bg-ink text-cream text-[11px] px-2.5 py-1.5 shadow-lg"
                    dir={locale === "en" ? "ltr" : "rtl"}
                  >
                    <p className="font-bold">{dateLabel(d.d, locale)}</p>
                    <p>
                      {t.legendSeated}: {d.seated} · {t.legendNoShow}: {d.noShow} · {t.legendWalked}: {d.walked}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-[2px] mt-1" dir="ltr" aria-hidden>
            {days.map((d, i) => (
              <span key={d.d} className="flex-1 min-w-0 text-start text-[10px] text-stone-400 whitespace-nowrap overflow-visible">
                {i % step === 0 ? axisDate(d.d) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Heatmap({ t, locale, heat }: { t: Dict; locale: Locale; heat: Report["heat"] }) {
  if (!heat.length) return null;
  const hours = heat.map((c) => c.h);
  // Show the restaurant's active hours; a late-night slot (0-3) sits after 23.
  const order = (h: number) => (h < 4 ? h + 24 : h);
  const minH = Math.min(...hours.map(order));
  const maxH = Math.max(...hours.map(order));
  const cols: number[] = [];
  for (let h = minH; h <= maxH; h++) cols.push(h % 24);
  const max = Math.max(1, ...heat.map((c) => c.joined));
  const at = (dow: number, h: number) => heat.find((c) => c.dow === dow && c.h === h);
  return (
    <Card title={t.heatTitle} sub={t.heatSub}>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }} dir="ltr">
          <thead>
            <tr>
              <th />
              {cols.map((h) => (
                <th key={h} className="text-[10px] font-normal text-stone-400 px-0.5">
                  {String(h).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
              <tr key={dow}>
                <th className="text-[11px] font-semibold text-stone-500 pe-2 text-end whitespace-nowrap">{dayName(dow, locale, "short")}</th>
                {cols.map((h) => {
                  const c = at(dow, h);
                  const share = c ? c.joined / max : 0;
                  const tip = c ? fmt(t.heatTip, { day: dayName(dow, locale), h: hh(h), n: c.joined, w: c.avgWait === null ? "–" : `${c.avgWait} ${t.min}` }) : undefined;
                  return (
                    <td key={h} className="p-0">
                      <div
                        title={tip}
                        className="w-6 h-6 rounded-[4px]"
                        style={{ background: c ? `color-mix(in oklab, ${C_SEATED} ${Math.round(12 + share * 88)}%, white)` : "#f5f3ef" }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Dishes({ t, locale, rep }: { t: Dict; locale: Locale; rep: Report }) {
  const total = rep.dishes.reduce((s, d) => s + d.revenue, 0);
  return (
    <Card title={t.dishesTitle}>
      {rep.dishes.length === 0 ? (
        <p className="text-sm text-stone-500">{t.noDishes}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-stone-500 text-start">
              <th className="text-start font-semibold pb-2">{t.colDish}</th>
              <th className="text-end font-semibold pb-2">{t.colQty}</th>
              <th className="text-end font-semibold pb-2">{t.colSales}</th>
            </tr>
          </thead>
          <tbody>
            {rep.dishes.slice(0, 10).map((d) => {
              const share = total ? d.revenue / total : 0;
              return (
                <tr key={d.id} className="border-t border-line">
                  <td className="py-2">
                    <p className="font-semibold leading-tight">{d.names[locale] || d.names.en}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: C_SEATED }} />
                    </div>
                  </td>
                  <td className="py-2 text-end ltr">{d.qty}</td>
                  <td className="py-2 text-end ltr whitespace-nowrap">
                    {money(d.revenue, rep.currency)}
                    <span className="block text-[10px] text-stone-400">{Math.round(share * 100)}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function DailyTable({ t, locale, rep }: { t: Dict; locale: Locale; rep: Report }) {
  const rows = [...rep.daily].reverse();
  return (
    <Card title={t.tableTitle}>
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="sticky top-0 bg-white">
            <tr className="text-[11px] text-stone-500">
              {[t.colDate, t.kpiParties, t.kpiSeated, t.kpiCovers, t.legendNoShow, t.legendWalked, t.kpiAvgWait, t.kpiPreOrders, t.kpiPreOrderSales].map((h, i) => (
                <th key={h} className={`font-semibold pb-2 px-2 ${i === 0 ? "text-start" : "text-end"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const x = totalsOf([d]);
              return (
                <tr key={d.d} className="border-t border-line">
                  <td className="py-1.5 px-2">{dateLabel(d.d, locale)}</td>
                  <td className="py-1.5 px-2 text-end ltr">{d.joined}</td>
                  <td className="py-1.5 px-2 text-end ltr">{d.seated}</td>
                  <td className="py-1.5 px-2 text-end ltr">{d.covers}</td>
                  <td className="py-1.5 px-2 text-end ltr">{d.noShow}</td>
                  <td className="py-1.5 px-2 text-end ltr">{d.walked}</td>
                  <td className="py-1.5 px-2 text-end">{x.avgWait === null ? "–" : `${x.avgWait} ${t.min}`}</td>
                  <td className="py-1.5 px-2 text-end ltr">{d.orders}</td>
                  <td className="py-1.5 px-2 text-end ltr">{money(d.sales, rep.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
