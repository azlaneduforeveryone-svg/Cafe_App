import "server-only";
import { cookies } from "next/headers";
import { adminClient } from "./supabase/admin";
import { broadcastChange } from "./realtime";
import { allOrdersForEntries, currencyOf, hasMenu, toOrder } from "./menu";
import { getRestaurantById, toPublic } from "./queue";
import type { Order, PublicRestaurant, Restaurant, Section } from "./types";

/**
 * Dining tables, table QR sessions and call-waiter alerts.
 *
 * Security: the database is reached only from here, with the server key. A guest proves they
 * are at a table with the session token from scanning its QR code. The token lives in an
 * httpOnly cookie (scripts and screenshots can't see it), is 64 random hex characters, is
 * checked against the table on every request, and dies when staff close the table.
 */

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string; status: number };
const fail = (error: string, status: number) => ({ ok: false as const, error, status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const SESSION_HOURS = 8;
export const cookieName = (tableId: string) => `tp_t_${tableId.replace(/-/g, "")}`;

export type TableStatus = "available" | "ordering" | "eating" | "bill" | "help";
export type AlertType = "water" | "napkins" | "bill" | "help";
export const ALERT_TYPES: AlertType[] = ["water", "napkins", "bill", "help"];

export interface DiningTable {
  id: string;
  number: string;
  capacity: number;
  sectionId: string;
  staffName: string;
  sort: number;
}
export interface ServiceAlert {
  id: string;
  tableId: string;
  type: AlertType;
  status: "open" | "acknowledged" | "resolved";
  createdAt: number;
}
export interface FloorTable extends DiningTable {
  status: TableStatus;
  session: { id: string; openedAt: number; openedBy: "guest" | "staff"; guestName: string; partySize: number | null } | null;
  orders: (Order & { tableNumber: string })[];
  alerts: ServiceAlert[];
}
export interface FloorSnapshot {
  serverNow: number;
  channel: string;
  currency: string;
  sections: Section[];
  tables: FloorTable[];
  /** Waitlist parties that can be seated at a table. */
  waiting: { id: string; ticketNumber: number; name: string; partySize: number; status: string; hasPreOrder: boolean }[];
  kpis: { activeTables: number; totalTables: number; ordersToday: number; revenueToday: number };
  wifi: { ssid: string; password: string };
}
export interface TableGuestSnapshot {
  serverNow: number;
  channel: string;
  restaurant: PublicRestaurant;
  table: { id: string; number: string };
  open: boolean;
  orders: Order[];
  alerts: { type: AlertType; status: string }[];
  wifi: { ssid: string; password: string } | null;
  hasMenu: boolean;
  currency: string;
}

interface TableRow {
  id: string;
  restaurant_id: string;
  table_number: string;
  capacity: number;
  section_id: string;
  assigned_staff_name: string;
  qr_secret: string;
  sort: number;
}
interface SessionRow {
  id: string;
  restaurant_id: string;
  table_id: string;
  token: string;
  entry_id: string | null;
  opened_by: "guest" | "staff";
  opened_at: string;
  closed_at: string | null;
}
interface AlertRow {
  id: string;
  table_id: string;
  alert_type: AlertType;
  status: ServiceAlert["status"];
  created_at: string;
}

const toTable = (r: TableRow): DiningTable => ({
  id: r.id,
  number: r.table_number,
  capacity: r.capacity,
  sectionId: r.section_id,
  staffName: r.assigned_staff_name,
  sort: r.sort,
});
const toAlert = (a: AlertRow): ServiceAlert => ({ id: a.id, tableId: a.table_id, type: a.alert_type, status: a.status, createdAt: Date.parse(a.created_at) });
const live = (s: SessionRow) => !s.closed_at && Date.parse(s.opened_at) > Date.now() - SESSION_HOURS * 3_600_000;

// ---------------------------------------------------------------------------
// Table management (staff)
// ---------------------------------------------------------------------------

export async function listTables(r: Restaurant): Promise<(DiningTable & { qrSecret: string })[]> {
  const { data } = await adminClient().from("restaurant_tables").select("*").eq("restaurant_id", r.id).order("sort").order("table_number");
  return ((data ?? []) as TableRow[]).map((t) => ({ ...toTable(t), qrSecret: t.qr_secret }));
}

function tableInput(r: Restaurant, b: Record<string, unknown>) {
  const number = str(b.number, 12);
  const capacity = Math.round(Number(b.capacity));
  const sectionId = typeof b.sectionId === "string" && r.sections.some((s) => s.id === b.sectionId) ? b.sectionId : "";
  if (!number) return null;
  return {
    table_number: number,
    capacity: Number.isInteger(capacity) && capacity >= 1 && capacity <= 40 ? capacity : 4,
    section_id: sectionId,
    assigned_staff_name: str(b.staffName, 40),
  };
}

const dbErr = (m: string | undefined) => (m?.includes("duplicate") ? fail("duplicate_table", 409) : fail("server_error", 500));

export async function createTable(r: Restaurant, b: Record<string, unknown>): Promise<Result> {
  const v = tableInput(r, b);
  if (!v) return fail("invalid", 400);
  const { count } = await adminClient().from("restaurant_tables").select("id", { count: "exact", head: true }).eq("restaurant_id", r.id);
  if ((count ?? 0) >= 200) return fail("too_many", 409);
  const { error } = await adminClient().from("restaurant_tables").insert({ ...v, restaurant_id: r.id, sort: count ?? 0 });
  if (error) return dbErr(error.message);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

export async function updateTable(r: Restaurant, id: string, b: Record<string, unknown>): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  const v = tableInput(r, b);
  if (!v) return fail("invalid", 400);
  const { data, error } = await adminClient()
    .from("restaurant_tables")
    .update({ ...v, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", r.id)
    .select("id")
    .maybeSingle();
  if (error) return dbErr(error.message);
  if (!data) return fail("not_found", 404);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

export async function deleteTable(r: Restaurant, id: string): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  const { data: open } = await adminClient().from("table_sessions").select("id").eq("table_id", id).is("closed_at", null).maybeSingle();
  if (open) return fail("table_busy", 409);
  const { error } = await adminClient().from("restaurant_tables").delete().eq("id", id).eq("restaurant_id", r.id);
  if (error) return fail("server_error", 500);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

/** New QR secret: printed copies of the old code stop working. */
export async function rotateQr(r: Restaurant, id: string): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  const secret = crypto.randomUUID().replace(/-/g, "");
  const { data } = await adminClient()
    .from("restaurant_tables")
    .update({ qr_secret: secret, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", r.id)
    .select("id")
    .maybeSingle();
  return data ? { ok: true, value: undefined } : fail("not_found", 404);
}

export const tableQrUrl = (origin: string, t: { id: string; qrSecret: string }) => `${origin}/t/${t.id}?k=${t.qrSecret}`;

export async function setWifi(r: Restaurant, b: Record<string, unknown>): Promise<Result> {
  const { error } = await adminClient()
    .from("restaurants")
    .update({ wifi_ssid: str(b.ssid, 64), wifi_password: str(b.password, 64) })
    .eq("id", r.id);
  if (error) return fail("server_error", 500);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Guest side
// ---------------------------------------------------------------------------

/** QR scan: checks the table secret and returns the session token to put in the cookie. */
export async function scanTable(tableId: string, secret: string): Promise<{ token: string; restaurantId: string } | null> {
  if (!UUID.test(tableId) || !/^[0-9a-f]{32}$/.test(secret)) return null;
  const { data, error } = await adminClient().rpc("tp_scan_table", { p_table_id: tableId, p_secret: secret, p_hours: SESSION_HOURS }).single();
  if (error || !data) return null;
  const s = data as SessionRow;
  await broadcastChange(s.restaurant_id);
  return { token: s.token, restaurantId: s.restaurant_id };
}

/** The guest's open session at this table, from their cookie. Null when missing, wrong or closed. */
export async function guestSession(tableId: string): Promise<SessionRow | null> {
  if (!UUID.test(tableId)) return null;
  const token = (await cookies()).get(cookieName(tableId))?.value ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await adminClient().from("table_sessions").select("*").eq("token", token).eq("table_id", tableId).maybeSingle();
  const s = data as SessionRow | null;
  return s && live(s) ? s : null;
}

export async function tableWithRestaurant(tableId: string): Promise<{ table: DiningTable; restaurant: Restaurant } | null> {
  if (!UUID.test(tableId)) return null;
  const { data } = await adminClient().from("restaurant_tables").select("*").eq("id", tableId).maybeSingle();
  if (!data) return null;
  const restaurant = await getRestaurantById((data as TableRow).restaurant_id);
  return restaurant ? { table: toTable(data as TableRow), restaurant } : null;
}

export async function guestSnapshot(tableId: string, s: SessionRow | null): Promise<TableGuestSnapshot | null> {
  const tr = await tableWithRestaurant(tableId);
  if (!tr) return null;
  const { table, restaurant: r } = tr;
  const db = adminClient();
  const [orders, alerts, rest, menuOn] = await Promise.all([
    s ? db.from("orders").select("*").eq("session_id", s.id).order("created_at") : Promise.resolve({ data: [] }),
    s ? db.from("service_alerts").select("alert_type, status").eq("session_id", s.id).neq("status", "resolved") : Promise.resolve({ data: [] }),
    s ? db.from("restaurants").select("wifi_ssid, wifi_password").eq("id", r.id).single() : Promise.resolve({ data: null }),
    s ? hasMenu(r.id) : Promise.resolve(false),
  ]);
  const wifiRow = rest.data as { wifi_ssid: string; wifi_password: string } | null;
  return {
    serverNow: Date.now(),
    channel: r.id,
    restaurant: toPublic(r),
    table: { id: table.id, number: table.number },
    open: !!s,
    orders: ((orders.data ?? []) as Parameters<typeof toOrder>[0][]).map(toOrder),
    alerts: ((alerts.data ?? []) as { alert_type: AlertType; status: string }[]).map((a) => ({ type: a.alert_type, status: a.status })),
    wifi: wifiRow && wifiRow.wifi_ssid ? { ssid: wifiRow.wifi_ssid, password: wifiRow.wifi_password } : null,
    hasMenu: menuOn,
    currency: currencyOf(r),
  };
}

function cartOf(b: Record<string, unknown>) {
  const raw = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
  return raw
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((x) => typeof x.id === "string" && UUID.test(x.id))
    .map((x) => ({ id: x.id as string, qty: Math.max(1, Math.min(20, Math.round(Number(x.qty) || 1))) }));
}

export async function sessionOrder(s: SessionRow, b: Record<string, unknown>): Promise<Result> {
  const items = cartOf(b);
  if (!items.length) return fail("empty", 400);
  const { error } = await adminClient()
    .rpc("tp_session_order", { p_session_id: s.id, p_items: items, p_note: str(b.note, 200), p_hours: SESSION_HOURS })
    .single();
  if (error) {
    for (const code of ["table_closed", "too_many_rounds", "empty", "too_many", "item_unavailable"]) if (error.message.includes(code)) return fail(code, 409);
    return fail("server_error", 500);
  }
  await broadcastChange(s.restaurant_id);
  return { ok: true, value: undefined };
}

export async function sessionCancelOrder(s: SessionRow): Promise<Result> {
  const { data } = await adminClient()
    .from("orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("session_id", s.id)
    .eq("kind", "table")
    .eq("status", "submitted")
    .select("id");
  if (!data?.length) return fail("order_locked", 409);
  await broadcastChange(s.restaurant_id);
  return { ok: true, value: undefined };
}

/** Call waiter. A second tap of the same button while it's still open does nothing (no spam). */
export async function raiseAlert(s: SessionRow, type: unknown): Promise<Result> {
  if (!ALERT_TYPES.includes(type as AlertType)) return fail("invalid", 400);
  const { error } = await adminClient()
    .from("service_alerts")
    .insert({ restaurant_id: s.restaurant_id, table_id: s.table_id, session_id: s.id, alert_type: type });
  if (error && error.code !== "23505") return fail("server_error", 500);
  await broadcastChange(s.restaurant_id);
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Staff floor
// ---------------------------------------------------------------------------

function startOfBusinessDay(r: Restaurant) {
  const off = (r.country === "SA" ? 180 : 300) * 60_000;
  const day = 86_400_000;
  const cutoff = 4 * 3_600_000;
  return Math.floor((Date.now() + off - cutoff) / day) * day + cutoff - off;
}

export async function floorSnapshot(r: Restaurant): Promise<FloorSnapshot> {
  const db = adminClient();
  const since = new Date(Date.now() - SESSION_HOURS * 3_600_000).toISOString();
  const [tables, sessions, alerts, today, waiting, rest] = await Promise.all([
    db.from("restaurant_tables").select("*").eq("restaurant_id", r.id).order("sort").order("table_number"),
    db.from("table_sessions").select("*").eq("restaurant_id", r.id).is("closed_at", null).gte("opened_at", since),
    db.from("service_alerts").select("*").eq("restaurant_id", r.id).neq("status", "resolved").order("created_at"),
    db
      .from("orders")
      .select("status, total")
      .eq("restaurant_id", r.id)
      .eq("status", "accepted")
      .gte("created_at", new Date(startOfBusinessDay(r)).toISOString()),
    db.from("entries").select("id, ticket_number, name, party_size, status").eq("restaurant_id", r.id).in("status", ["waiting", "notified"]).order("joined_at"),
    db.from("restaurants").select("wifi_ssid, wifi_password").eq("id", r.id).single(),
  ]);
  const sess = (sessions.data ?? []) as SessionRow[];
  const sessIds = sess.map((s) => s.id);
  const entryIds = sess.map((s) => s.entry_id).filter((x): x is string => !!x);
  const [ordersRes, entriesRes, preOrders] = await Promise.all([
    sessIds.length ? db.from("orders").select("*").in("session_id", sessIds).neq("status", "cancelled").order("created_at") : Promise.resolve({ data: [] }),
    entryIds.length ? db.from("entries").select("id, name, party_size").in("id", entryIds) : Promise.resolve({ data: [] }),
    allOrdersForEntries(((waiting.data ?? []) as { id: string }[]).map((e) => e.id)),
  ]);
  const entryById = new Map(((entriesRes.data ?? []) as { id: string; name: string; party_size: number }[]).map((e) => [e.id, e]));
  const ordersBySession = new Map<string, (Order & { session_id: string })[]>();
  for (const row of (ordersRes.data ?? []) as (Parameters<typeof toOrder>[0] & { session_id: string })[]) {
    const list = ordersBySession.get(row.session_id) ?? [];
    list.push({ ...toOrder(row), session_id: row.session_id });
    ordersBySession.set(row.session_id, list);
  }
  const alertRows = ((alerts.data ?? []) as AlertRow[]).map(toAlert);
  const floor: FloorTable[] = ((tables.data ?? []) as TableRow[]).map((row) => {
    const t = toTable(row);
    const s = sess.find((x) => x.table_id === t.id) ?? null;
    const orders = s ? (ordersBySession.get(s.id) ?? []).map((o) => ({ ...o, tableNumber: t.number })) : [];
    const al = s ? alertRows.filter((a) => a.tableId === t.id) : [];
    const entry = s?.entry_id ? entryById.get(s.entry_id) : undefined;
    let status: TableStatus = "available";
    if (s) {
      if (al.some((a) => a.type === "help" || a.type === "water" || a.type === "napkins")) status = "help";
      else if (al.some((a) => a.type === "bill")) status = "bill";
      else if (orders.some((o) => o.status === "accepted")) status = "eating";
      else status = "ordering";
    }
    return {
      ...t,
      status,
      session: s
        ? { id: s.id, openedAt: Date.parse(s.opened_at), openedBy: s.opened_by, guestName: entry?.name ?? "", partySize: entry?.party_size ?? null }
        : null,
      orders,
      alerts: al,
    };
  });
  const acc = (today.data ?? []) as { total: string | number }[];
  const wifiRow = rest.data as { wifi_ssid: string; wifi_password: string } | null;
  return {
    serverNow: Date.now(),
    channel: r.id,
    currency: currencyOf(r),
    sections: r.sections,
    tables: floor,
    waiting: ((waiting.data ?? []) as { id: string; ticket_number: number; name: string; party_size: number; status: string }[]).map((e) => ({
      id: e.id,
      ticketNumber: e.ticket_number,
      name: e.name,
      partySize: e.party_size,
      status: e.status,
      hasPreOrder: (preOrders.get(e.id) ?? []).some((o) => o.kind === "pre"),
    })),
    kpis: {
      activeTables: floor.filter((t) => t.session).length,
      totalTables: floor.length,
      ordersToday: acc.length,
      revenueToday: Math.round(acc.reduce((s, o) => s + Number(o.total), 0) * 100) / 100,
    },
    wifi: { ssid: wifiRow?.wifi_ssid ?? "", password: wifiRow?.wifi_password ?? "" },
  };
}

export async function seatAtTable(r: Restaurant, tableId: string, entryId: unknown): Promise<Result> {
  if (!UUID.test(tableId) || typeof entryId !== "string" || !UUID.test(entryId)) return fail("not_found", 404);
  const { error } = await adminClient().rpc("tp_seat_at_table", { p_restaurant_id: r.id, p_entry_id: entryId, p_table_id: tableId }).single();
  if (error) return error.message.includes("table_busy") ? fail("table_busy", 409) : fail("not_found", 404);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

/** Staff opens a table for walk-in guests without a waitlist ticket (guests then scan to order). */
export async function openTable(r: Restaurant, tableId: string): Promise<Result> {
  if (!UUID.test(tableId)) return fail("not_found", 404);
  const { data: t } = await adminClient().from("restaurant_tables").select("id").eq("id", tableId).eq("restaurant_id", r.id).maybeSingle();
  if (!t) return fail("not_found", 404);
  const { error } = await adminClient().from("table_sessions").insert({ restaurant_id: r.id, table_id: tableId, opened_by: "staff" });
  if (error) return error.code === "23505" ? fail("table_busy", 409) : fail("server_error", 500);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

/** Guests left: end the session (their phones lose access), drop unapproved orders, clear alerts. */
export async function closeTable(r: Restaurant, tableId: string): Promise<Result> {
  if (!UUID.test(tableId)) return fail("not_found", 404);
  const db = adminClient();
  const now = new Date().toISOString();
  const { data } = await db
    .from("table_sessions")
    .update({ closed_at: now })
    .eq("table_id", tableId)
    .eq("restaurant_id", r.id)
    .is("closed_at", null)
    .select("id, entry_id");
  const closed = (data ?? []) as { id: string; entry_id: string | null }[];
  for (const s of closed) {
    await db.from("orders").update({ status: "cancelled", updated_at: now }).eq("session_id", s.id).eq("status", "submitted");
    await db.from("service_alerts").update({ status: "resolved", resolved_at: now }).eq("session_id", s.id).neq("status", "resolved");
    if (s.entry_id) await db.from("entries").update({ table_closed_at: now }).eq("id", s.entry_id);
  }
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

export async function resolveAlert(r: Restaurant, alertId: string, action: "ack" | "resolve"): Promise<Result> {
  if (!UUID.test(alertId)) return fail("not_found", 404);
  const now = new Date().toISOString();
  const patch = action === "ack" ? { status: "acknowledged", acknowledged_at: now } : { status: "resolved", resolved_at: now };
  const { data } = await adminClient().from("service_alerts").update(patch).eq("id", alertId).eq("restaurant_id", r.id).select("id").maybeSingle();
  if (!data) return fail("not_found", 404);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

