import "server-only";
import { adminClient } from "./supabase/admin";
import { currencyOf, hasMenu } from "./menu";
import type { Country, Restaurant } from "./types";

/**
 * Business reports. Every number is computed in SQL (tp_report) and summed here;
 * nothing is estimated. The objects below hold totals only, never guest names or
 * phones, so they are safe to hand to an AI summary later.
 */

const DAY = 86_400_000;
const CUTOFF_H = 4; // a business day runs 4:00 AM to 3:59 AM local time
export const MAX_RANGE_DAYS = 92;

export const offsetMin = (c: Country) => (c === "SA" ? 180 : 300);

// ---------------------------------------------------------------------------
// Dates (YYYY-MM-DD strings, no time zone)
// ---------------------------------------------------------------------------

const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fromISO = (s: string) => Date.parse(s + "T00:00:00Z");
export const addDays = (d: string, n: number) => toISO(fromISO(d) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((fromISO(b) - fromISO(a)) / DAY) + 1;
export const isISODate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromISO(s));

/** Today's business date for the restaurant (before 4 AM it is still yesterday). */
export function businessToday(country: Country) {
  return toISO(Date.now() + (offsetMin(country) - CUTOFF_H * 60) * 60_000);
}

export type RangeKey = "7" | "30" | "90" | "month" | "lastmonth" | "custom";
export interface Range {
  key: RangeKey;
  from: string;
  to: string;
  days: number;
}

/** Reads ?range= or ?from=&to= into a safe date range. Defaults to the last 7 days. */
export function parseRange(country: Country, q: Record<string, string | string[] | undefined>): Range {
  const today = businessToday(country);
  const get = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : undefined);
  const key = get("range");
  const make = (k: RangeKey, from: string, to: string): Range => ({ key: k, from, to, days: daysBetween(from, to) });

  if (key === "custom") {
    const from = get("from");
    const to = get("to");
    if (isISODate(from) && isISODate(to)) {
      let a = from <= to ? from : to;
      let b = from <= to ? to : from;
      if (b > today) b = today;
      if (a > b) a = b;
      if (daysBetween(a, b) > MAX_RANGE_DAYS) a = addDays(b, -(MAX_RANGE_DAYS - 1));
      return make("custom", a, b);
    }
  }
  if (key === "month") return make("month", today.slice(0, 8) + "01", today);
  if (key === "lastmonth") {
    const firstThis = today.slice(0, 8) + "01";
    const lastPrev = addDays(firstThis, -1);
    return make("lastmonth", lastPrev.slice(0, 8) + "01", lastPrev);
  }
  if (key === "30") return make("30", addDays(today, -29), today);
  if (key === "90") return make("90", addDays(today, -89), today);
  return make("7", addDays(today, -6), today);
}

// ---------------------------------------------------------------------------
// Raw data from tp_report
// ---------------------------------------------------------------------------

export interface DayRow {
  d: string;
  joined: number;
  seated: number;
  covers: number;
  noShow: number;
  walked: number;
  qr: number;
  walkin: number;
  waitSum: number;
  waitN: number;
  orders: number;
  sales: number;
  wasted: number;
  wastedValue: number;
}
interface HourRow {
  dow: number;
  h: number;
  joined: number;
  waitSum: number;
  waitN: number;
}
interface ItemRow {
  d: string;
  id: string;
  qty: number;
  revenue: number;
}
export interface DishNames {
  en: string;
  ar: string;
  ur: string;
}
interface Raw {
  days: DayRow[];
  hours: HourRow[];
  items: ItemRow[];
  names: Record<string, DishNames>;
}

const DAY_KEYS: (keyof DayRow)[] = ["joined", "seated", "covers", "noShow", "walked", "qr", "walkin", "waitSum", "waitN", "orders", "sales", "wasted", "wastedValue"];

async function fetchRaw(r: Restaurant, from: string, to: string): Promise<Raw> {
  const { data, error } = await adminClient().rpc("tp_report", {
    p_restaurant_id: r.id,
    p_from: from,
    p_to: to,
    p_offset_min: offsetMin(r.country),
  });
  if (error) throw new Error(error.message);
  const j = (data ?? {}) as Partial<Raw>;
  return {
    days: (j.days ?? []).map((d) => {
      const row = { ...d } as DayRow;
      for (const k of DAY_KEYS) (row as unknown as Record<string, number>)[k] = Number(d[k]) || 0;
      return row;
    }),
    hours: (j.hours ?? []).map((h) => ({ dow: Number(h.dow), h: Number(h.h), joined: Number(h.joined) || 0, waitSum: Number(h.waitSum) || 0, waitN: Number(h.waitN) || 0 })),
    items: (j.items ?? []).map((i) => ({ d: i.d, id: i.id, qty: Number(i.qty) || 0, revenue: Number(i.revenue) || 0 })),
    names: j.names ?? {},
  };
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export interface Totals {
  parties: number;
  seated: number;
  covers: number;
  noShows: number;
  walked: number;
  /** Shares are 0 to 1, null when there is nothing to divide by. */
  noShowRate: number | null;
  walkedRate: number | null;
  qrShare: number | null;
  avgWait: number | null;
  preOrders: number;
  preOrderSales: number;
  preOrderRate: number | null;
  avgPreOrder: number | null;
  wasted: number;
  wastedValue: number;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function totalsOf(rows: DayRow[]): Totals {
  const s = (k: keyof DayRow) => rows.reduce((sum, r) => sum + (r[k] as number), 0);
  const parties = s("joined");
  const seated = s("seated");
  const closed = seated + s("noShow") + s("walked");
  const preOrders = s("orders");
  const sales = round2(s("sales"));
  const waitN = s("waitN");
  return {
    parties,
    seated,
    covers: s("covers"),
    noShows: s("noShow"),
    walked: s("walked"),
    noShowRate: ratio(s("noShow"), closed),
    walkedRate: ratio(s("walked"), closed),
    qrShare: ratio(s("qr"), parties),
    avgWait: waitN ? Math.round(s("waitSum") / waitN) : null,
    preOrders,
    preOrderSales: sales,
    preOrderRate: ratio(preOrders, seated),
    avgPreOrder: preOrders ? round2(sales / preOrders) : null,
    wasted: s("wasted"),
    wastedValue: round2(s("wastedValue")),
  };
}

/** Every day in the range, with zero rows for quiet days. */
function fillDays(rows: DayRow[], from: string, to: string): DayRow[] {
  const byDay = new Map(rows.map((r) => [r.d, r]));
  const out: DayRow[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const zero = { d } as DayRow;
    for (const k of DAY_KEYS) (zero as unknown as Record<string, number>)[k] = 0;
    out.push(byDay.get(d) ?? zero);
  }
  return out;
}

export interface Dish {
  id: string;
  names: DishNames;
  qty: number;
  revenue: number;
}

function dishesOf(items: ItemRow[], names: Record<string, DishNames>, from: string, to: string): Dish[] {
  const m = new Map<string, Dish>();
  for (const i of items) {
    if (i.d < from || i.d > to) continue;
    const cur = m.get(i.id) ?? { id: i.id, names: names[i.id] ?? { en: "?", ar: "?", ur: "?" }, qty: 0, revenue: 0 };
    cur.qty += i.qty;
    cur.revenue = round2(cur.revenue + i.revenue);
    m.set(i.id, cur);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue || b.qty - a.qty);
}

export interface HeatCell {
  dow: number; // 1 = Monday ... 7 = Sunday
  h: number; // local hour 0-23
  joined: number;
  avgWait: number | null;
}

// ---------------------------------------------------------------------------
// The report shown on the page
// ---------------------------------------------------------------------------

export interface Report {
  currency: string;
  range: Range;
  previous: { from: string; to: string };
  current: Totals;
  prior: Totals;
  daily: DayRow[];
  dishes: Dish[];
  heat: HeatCell[];
}

export async function buildReport(r: Restaurant, range: Range): Promise<Report> {
  const prevTo = addDays(range.from, -1);
  const prevFrom = addDays(prevTo, -(range.days - 1));
  // One query covers this period and the one before it (for the change arrows);
  // busy times need the selected period alone.
  const [raw, cur] = await Promise.all([fetchRaw(r, prevFrom, range.to), fetchRaw(r, range.from, range.to)]);
  return {
    currency: currencyOf(r),
    range,
    previous: { from: prevFrom, to: prevTo },
    current: totalsOf(cur.days),
    prior: totalsOf(raw.days.filter((d) => d.d < range.from)),
    daily: fillDays(cur.days, range.from, range.to),
    dishes: dishesOf(cur.items, cur.names, range.from, range.to),
    heat: cur.hours.map((h) => ({ dow: h.dow, h: h.h, joined: h.joined, avgWait: h.waitN ? Math.round(h.waitSum / h.waitN) : null })),
  };
}

// ---------------------------------------------------------------------------
// Alerts: plain rules, no AI. Compare the last 7 full days with the 28 days before.
// ---------------------------------------------------------------------------

export type AlertCode =
  | "no_show_up"
  | "wait_up"
  | "walkaway_high"
  | "wasted_orders"
  | "dish_dropped"
  | "busiest_time"
  | "preorder_low"
  | "all_good"
  | "not_enough_data";

export interface Alert {
  code: AlertCode;
  level: "warn" | "info" | "good";
  /** Numbers and dish names for the message template. Shares are whole percents. */
  params: Record<string, string | number>;
}

const pct = (x: number | null) => Math.round((x ?? 0) * 100);

/** Minimum volumes so one bad night doesn't raise an alarm. */
export const ALERT_RULES = {
  minParties: 20,
  minBaselineParties: 40,
  noShowJumpPts: 0.05,
  noShowJumpTimes: 1.5,
  minSeatedForWait: 10,
  waitJumpTimes: 1.3,
  waitJumpMin: 5,
  walkawayRate: 0.1,
  walkawayJumpPts: 0.03,
  dishBaselineQty: 8,
  dishMinOrders: 5,
  preorderMinSeated: 30,
  preorderLowRate: 0.05,
  busiestMinParties: 50,
};

export async function buildAlerts(r: Restaurant): Promise<{ alerts: Alert[]; from: string; to: string }> {
  const R = ALERT_RULES;
  const to = addDays(businessToday(r.country), -1); // yesterday: last full day
  const from = addDays(to, -6);
  const baseFrom = addDays(from, -28);
  const [raw, menuOn, available] = await Promise.all([
    fetchRaw(r, baseFrom, to),
    hasMenu(r.id),
    adminClient().from("menu_items").select("id").eq("restaurant_id", r.id).eq("available", true),
  ]);
  const cur = totalsOf(raw.days.filter((d) => d.d >= from));
  const base = totalsOf(raw.days.filter((d) => d.d < from));
  const alerts: Alert[] = [];

  if (cur.parties < R.minParties) {
    alerts.push({ code: "not_enough_data", level: "info", params: { n: cur.parties, min: R.minParties } });
  } else {
    const hasBase = base.parties >= R.minBaselineParties;

    if (hasBase && cur.noShowRate !== null && base.noShowRate !== null) {
      if (cur.noShowRate >= base.noShowRate + R.noShowJumpPts && cur.noShowRate >= base.noShowRate * R.noShowJumpTimes) {
        alerts.push({ code: "no_show_up", level: "warn", params: { cur: pct(cur.noShowRate), base: pct(base.noShowRate), n: cur.noShows } });
      }
    }

    const curWaitN = raw.days.filter((d) => d.d >= from).reduce((s, d) => s + d.waitN, 0);
    if (hasBase && cur.avgWait !== null && base.avgWait !== null && curWaitN >= R.minSeatedForWait) {
      if (cur.avgWait >= base.avgWait * R.waitJumpTimes && cur.avgWait - base.avgWait >= R.waitJumpMin) {
        alerts.push({ code: "wait_up", level: "warn", params: { cur: cur.avgWait, base: base.avgWait } });
      }
    }

    if (cur.walkedRate !== null && cur.walkedRate >= R.walkawayRate) {
      const baseRate = base.walkedRate ?? 0;
      if (!hasBase || cur.walkedRate >= baseRate + R.walkawayJumpPts) {
        alerts.push({ code: "walkaway_high", level: "warn", params: { cur: pct(cur.walkedRate), n: cur.walked } });
      }
    }

    if (menuOn && cur.seated >= R.preorderMinSeated && (cur.preOrderRate ?? 0) < R.preorderLowRate) {
      alerts.push({ code: "preorder_low", level: "info", params: { cur: pct(cur.preOrderRate) } });
    }
  }

  if (cur.wasted > 0) {
    alerts.push({ code: "wasted_orders", level: "warn", params: { n: cur.wasted, value: cur.wastedValue, currency: currencyOf(r) } });
  }

  // A dish that sold regularly before and not at all this week, while orders kept coming.
  if (cur.preOrders >= R.dishMinOrders) {
    const availableIds = new Set(((available.data ?? []) as { id: string }[]).map((x) => x.id));
    const before = dishesOf(raw.items, raw.names, baseFrom, addDays(from, -1));
    const now = new Set(dishesOf(raw.items, raw.names, from, to).map((d) => d.id));
    before
      .filter((d) => d.qty >= R.dishBaselineQty && !now.has(d.id) && availableIds.has(d.id))
      .slice(0, 3)
      .forEach((d) => alerts.push({ code: "dish_dropped", level: "warn", params: { nameEn: d.names.en, nameAr: d.names.ar, nameUr: d.names.ur, base: d.qty } }));
  }

  // Busiest hour over all 35 days, as information for staffing.
  const all = totalsOf(raw.days);
  if (all.parties >= R.busiestMinParties && raw.hours.length) {
    const top = [...raw.hours].sort((a, b) => b.joined - a.joined)[0];
    alerts.push({
      code: "busiest_time",
      level: "info",
      params: { dow: top.dow, h: top.h, n: top.joined, wait: top.waitN ? Math.round(top.waitSum / top.waitN) : 0 },
    });
  }

  if (cur.parties >= R.minParties && !alerts.some((a) => a.level === "warn")) {
    alerts.unshift({ code: "all_good", level: "good", params: {} });
  }
  return { alerts, from, to };
}

// ---------------------------------------------------------------------------
// CSV (UTF-8 with BOM so Excel shows Arabic and Urdu correctly)
// ---------------------------------------------------------------------------

const cell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  // Quote everything; neutralise spreadsheet formulas in text cells.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const toCSV = (rows: (string | number | null)[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const pct1 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 10);

export function dailyCSV(rep: Report) {
  const head = [
    "Business date", "Parties joined", "Seated parties", "Guests seated", "No-shows", "Walked away",
    "No-show %", "Avg wait (min)", "Joined by QR", "Walk-ins added by host",
    "Pre-orders (seated)", `Pre-order sales (${rep.currency})`, "Pre-orders not collected", `Not collected value (${rep.currency})`,
  ];
  const rows = rep.daily.map((d) => {
    const t = totalsOf([d]);
    return [d.d, d.joined, d.seated, d.covers, d.noShow, d.walked, pct1(t.noShowRate), t.avgWait, d.qr, d.walkin, d.orders, round2(d.sales), d.wasted, round2(d.wastedValue)];
  });
  const c = rep.current;
  rows.push([
    "Total", c.parties, c.seated, c.covers, c.noShows, c.walked, pct1(c.noShowRate), c.avgWait,
    rep.daily.reduce((s, d) => s + d.qr, 0), rep.daily.reduce((s, d) => s + d.walkin, 0),
    c.preOrders, c.preOrderSales, c.wasted, c.wastedValue,
  ]);
  return toCSV([head, ...rows]);
}

export function dishesCSV(rep: Report) {
  const total = rep.dishes.reduce((s, d) => s + d.revenue, 0);
  return toCSV([
    ["Dish (English)", "Dish (Arabic)", "Dish (Urdu)", "Quantity", `Sales (${rep.currency})`, "Share of pre-order sales %"],
    ...rep.dishes.map((d) => [d.names.en, d.names.ar, d.names.ur, d.qty, d.revenue, total ? Math.round((d.revenue / total) * 1000) / 10 : 0]),
  ]);
}
