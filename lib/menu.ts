import "server-only";
import { adminClient } from "./supabase/admin";
import { broadcastChange } from "./realtime";
import { deleteImage, ownsPath, publicUrl } from "./media";
import { PRICING } from "./pricing";
import type { MealPeriod, Menu, MenuCategory, MenuItem, Order, OrderLine, OrderStatus, Restaurant } from "./types";

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string; status: number };
const fail = (error: string, status: number) => ({ ok: false as const, error, status });

function dbFail(message: string | undefined) {
  const m = message ?? "";
  for (const code of ["not_active", "order_locked", "empty", "too_many_rounds", "too_many", "item_unavailable", "table_closed"]) {
    if (m.includes(code)) return fail(code, code === "not_active" ? 404 : 409);
  }
  if (m.includes("violates check constraint")) return fail("invalid", 400);
  console.error("[tablepulse] menu database error:", m);
  return fail("server_error", 500);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const money = (v: unknown) => {
  const n = Math.round(Number(v) * 100) / 100;
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? n : null;
};

export const currencyOf = (r: Pick<Restaurant, "country">) => PRICING[r.country].currency;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface CategoryRow {
  id: string;
  name_en: string;
  name_ar: string;
  name_ur: string;
  sort: number;
  days?: number;
  periods?: string[];
}
interface ItemRow {
  id: string;
  category_id: string | null;
  name_en: string;
  name_ar: string;
  name_ur: string;
  desc_en: string;
  desc_ar: string;
  desc_ur: string;
  price: string | number;
  compare_at_price: string | number | null;
  is_deal: boolean;
  image_path: string | null;
  available: boolean;
  back_at?: string | null;
  days?: number;
  periods?: string[];
  sort: number;
}
interface OrderRow {
  id: string;
  entry_id: string;
  kind?: "pre" | "table";
  round?: number;
  created_at?: string;
  status: OrderStatus;
  items: OrderLine[];
  total: string | number;
  note: string;
  updated_at: string;
}

const toCategory = (r: CategoryRow): MenuCategory => ({
  id: r.id,
  nameEn: r.name_en,
  nameAr: r.name_ar,
  nameUr: r.name_ur,
  sort: r.sort,
  days: r.days ?? 127,
  periods: r.periods ?? [],
});
type ItemStatus = { in_stock: boolean; on_schedule: boolean };
const toItem = (r: ItemRow, st?: ItemStatus): MenuItem => ({
  id: r.id,
  categoryId: r.category_id,
  nameEn: r.name_en,
  nameAr: r.name_ar,
  nameUr: r.name_ur,
  descEn: r.desc_en,
  descAr: r.desc_ar,
  descUr: r.desc_ur,
  price: Number(r.price),
  compareAtPrice: r.compare_at_price === null ? null : Number(r.compare_at_price),
  isDeal: r.is_deal,
  imagePath: r.image_path,
  imageUrl: publicUrl(r.image_path),
  available: r.available,
  backAt: r.back_at ? Date.parse(r.back_at) : null,
  days: r.days ?? 127,
  periods: r.periods ?? [],
  inStock: st ? st.in_stock : r.available,
  onSchedule: st ? st.on_schedule : true,
  sort: r.sort,
});
export const toOrder = (r: OrderRow): Order => ({
  id: r.id,
  kind: r.kind ?? "pre",
  round: r.round ?? 0,
  status: r.status,
  items: (r.items ?? []).map((l) => ({ ...l, price: Number(l.price) })),
  total: Number(r.total),
  note: r.note,
  createdAt: Date.parse(r.created_at ?? r.updated_at),
  updatedAt: Date.parse(r.updated_at),
});

// ---------------------------------------------------------------------------
// Menu reads
// ---------------------------------------------------------------------------

export const mealPeriodsOf = (r: Pick<Restaurant, "mealPeriods">): MealPeriod[] => r.mealPeriods ?? [];

async function menuStatus(restaurantId: string): Promise<Map<string, ItemStatus>> {
  const { data, error } = await adminClient().rpc("tp_menu_status", { p_restaurant_id: restaurantId });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as (ItemStatus & { id: string })[]).map((x) => [x.id, x]));
}

/**
 * Guests see dishes that are on the menu right now (sold-out ones stay visible, marked
 * sold out); dishes outside their days or meal times are left out. The editor sees everything.
 */
export async function getMenu(r: Restaurant, opts: { includeHidden?: boolean } = {}): Promise<Menu> {
  const [cats, its, status] = await Promise.all([
    adminClient().from("menu_categories").select("*").eq("restaurant_id", r.id).order("sort").order("created_at"),
    adminClient().from("menu_items").select("*").eq("restaurant_id", r.id).order("sort").order("created_at"),
    menuStatus(r.id),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (its.error) throw new Error(its.error.message);
  let items = (its.data as ItemRow[]).map((row) => toItem(row, status.get(row.id)));
  if (!opts.includeHidden) items = items.filter((i) => i.onSchedule);
  return {
    currency: currencyOf(r),
    mealPeriods: mealPeriodsOf(r),
    categories: (cats.data as CategoryRow[]).map(toCategory),
    items,
  };
}

/** Whether a guest could order something right now. */
export async function hasMenu(restaurantId: string): Promise<boolean> {
  const status = await menuStatus(restaurantId);
  for (const s of status.values()) if (s.in_stock && s.on_schedule) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Days and meal times
// ---------------------------------------------------------------------------

const daysOf = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isInteger(n) && n >= 1 && n <= 127 ? n : 127;
};
const periodsOf = (r: Restaurant, v: unknown) => {
  const ids = new Set(mealPeriodsOf(r).map((p) => p.id));
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && ids.has(x)))].slice(0, 6) : [];
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Replace the restaurant's meal times. Dishes tied to a removed meal time become all-day. */
export async function setMealPeriods(r: Restaurant, input: unknown): Promise<Result> {
  if (!Array.isArray(input) || input.length > 6) return fail("invalid", 400);
  const seen = new Set<string>();
  const out: MealPeriod[] = [];
  for (const raw of input) {
    const p = (raw ?? {}) as Record<string, unknown>;
    const v = {
      id: str(p.id, 20).toLowerCase(),
      en: str(p.en, 20),
      ar: str(p.ar, 20),
      ur: str(p.ur, 20),
      start: str(p.start, 5),
      end: str(p.end, 5),
    };
    if (!/^[a-z0-9-]{1,20}$/.test(v.id) || seen.has(v.id)) return fail("invalid", 400);
    if (!v.en || !v.ar || !v.ur) return fail("all_languages", 400);
    if (!HHMM.test(v.start) || !HHMM.test(v.end) || v.start === v.end) return fail("bad_time", 400);
    seen.add(v.id);
    out.push(v);
  }
  const { error } = await adminClient().from("restaurants").update({ meal_periods: out }).eq("id", r.id);
  if (error) return dbFail(error.message);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

/** Next 4:00 AM in the restaurant's time zone: when "sold out today" ends. */
export function nextBusinessDayStart(r: Pick<Restaurant, "country">, now = Date.now()) {
  const off = (r.country === "SA" ? 180 : 300) * 60_000;
  const day = 86_400_000;
  const cutoff = 4 * 3_600_000;
  const local = now + off;
  const startOfBusinessDay = Math.floor((local - cutoff) / day) * day + cutoff;
  return startOfBusinessDay + day - off;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function categoryInput(r: Restaurant, b: Record<string, unknown>) {
  const v = { name_en: str(b.nameEn, 40), name_ar: str(b.nameAr, 40), name_ur: str(b.nameUr, 40), days: daysOf(b.days), periods: periodsOf(r, b.periods) };
  return v.name_en && v.name_ar && v.name_ur ? v : null;
}

export async function createCategory(r: Restaurant, b: Record<string, unknown>): Promise<Result> {
  const v = categoryInput(r, b);
  if (!v) return fail("all_languages", 400);
  const { count } = await adminClient().from("menu_categories").select("id", { count: "exact", head: true }).eq("restaurant_id", r.id);
  if ((count ?? 0) >= 30) return fail("too_many", 409);
  const { error } = await adminClient().from("menu_categories").insert({ ...v, restaurant_id: r.id, sort: count ?? 0 });
  if (error) return dbFail(error.message);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

export async function updateCategory(r: Restaurant, id: string, b: Record<string, unknown>): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  const v = categoryInput(r, b);
  if (!v) return fail("all_languages", 400);
  const { data, error } = await adminClient().from("menu_categories").update(v).eq("id", id).eq("restaurant_id", r.id).select("id").maybeSingle();
  if (error) return dbFail(error.message);
  if (!data) return fail("not_found", 404);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

export async function deleteCategory(r: Restaurant, id: string): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  const { error } = await adminClient().from("menu_categories").delete().eq("id", id).eq("restaurant_id", r.id);
  if (error) return dbFail(error.message);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Items (dishes and deals)
// ---------------------------------------------------------------------------

async function itemInput(r: Restaurant, b: Record<string, unknown>) {
  const v = {
    name_en: str(b.nameEn, 80),
    name_ar: str(b.nameAr, 80),
    name_ur: str(b.nameUr, 80),
    desc_en: str(b.descEn, 300),
    desc_ar: str(b.descAr, 300),
    desc_ur: str(b.descUr, 300),
    price: money(b.price),
    compare_at_price: b.compareAtPrice === null || b.compareAtPrice === "" || b.compareAtPrice === undefined ? null : money(b.compareAtPrice),
    is_deal: b.isDeal === true,
    days: daysOf(b.days),
    periods: periodsOf(r, b.periods),
    category_id: typeof b.categoryId === "string" && UUID.test(b.categoryId) ? b.categoryId : null,
    image_path: typeof b.imagePath === "string" && b.imagePath ? b.imagePath : null,
  };
  if (!v.name_en || !v.name_ar || !v.name_ur || !v.desc_en || !v.desc_ar || !v.desc_ur) return fail("all_languages", 400);
  if (v.price === null) return fail("bad_price", 400);
  if (v.compare_at_price !== null && v.compare_at_price <= v.price) return fail("bad_compare_price", 400);
  if (v.image_path && !ownsPath(r.id, v.image_path)) return fail("bad_image", 400);
  if (v.category_id) {
    const { data } = await adminClient().from("menu_categories").select("id").eq("id", v.category_id).eq("restaurant_id", r.id).maybeSingle();
    if (!data) v.category_id = null;
  }
  return { ok: true as const, value: v };
}

export async function createItem(r: Restaurant, b: Record<string, unknown>): Promise<Result> {
  const input = await itemInput(r, b);
  if (!input.ok) return input;
  const { count } = await adminClient().from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", r.id);
  if ((count ?? 0) >= 300) return fail("too_many", 409);
  const { error } = await adminClient().from("menu_items").insert({ ...input.value, available: true, restaurant_id: r.id, sort: count ?? 0 });
  if (error) return dbFail(error.message);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

export async function updateItem(r: Restaurant, id: string, b: Record<string, unknown>): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  const input = await itemInput(r, b);
  if (!input.ok) return input;
  const { data: old } = await adminClient().from("menu_items").select("image_path").eq("id", id).eq("restaurant_id", r.id).maybeSingle();
  if (!old) return fail("not_found", 404);
  const { error } = await adminClient().from("menu_items").update(input.value).eq("id", id).eq("restaurant_id", r.id);
  if (error) return dbFail(error.message);
  if (old.image_path && old.image_path !== input.value.image_path) await deleteImage(old.image_path as string);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

export type StockMode = "in" | "out_today" | "out";

/** In stock, sold out until tomorrow (back by itself at 4 AM), or sold out until turned back on. */
export async function setItemStock(r: Restaurant, id: string, mode: StockMode): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  const patch =
    mode === "in"
      ? { available: true, back_at: null }
      : mode === "out_today"
        ? { available: false, back_at: new Date(nextBusinessDayStart(r)).toISOString() }
        : { available: false, back_at: null };
  const { data, error } = await adminClient().from("menu_items").update(patch).eq("id", id).eq("restaurant_id", r.id).select("id").maybeSingle();
  if (error) return dbFail(error.message);
  if (!data) return fail("not_found", 404);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

export async function deleteItem(r: Restaurant, id: string): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  const { data, error } = await adminClient().from("menu_items").delete().eq("id", id).eq("restaurant_id", r.id).select("image_path").maybeSingle();
  if (error) return dbFail(error.message);
  if (data?.image_path) await deleteImage(data.image_path as string);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export async function setLogo(r: Restaurant, path: string | null): Promise<Result> {
  if (path && !ownsPath(r.id, path)) return fail("bad_image", 400);
  const { error } = await adminClient().from("restaurants").update({ logo_path: path }).eq("id", r.id);
  if (error) return dbFail(error.message);
  if (r.logoPath && r.logoPath !== path) await deleteImage(r.logoPath);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Pre-orders
// ---------------------------------------------------------------------------

/** Open (not cancelled) orders for the given tickets, keyed by ticket id. */
export async function ordersForEntries(entryIds: string[]): Promise<Map<string, Order>> {
  const map = new Map<string, Order>();
  if (!entryIds.length) return map;
  const { data } = await adminClient().from("orders").select("*").in("entry_id", entryIds).eq("kind", "pre").neq("status", "cancelled");
  for (const row of (data ?? []) as OrderRow[]) map.set(row.entry_id, toOrder(row));
  return map;
}

export async function orderForEntry(entryId: string): Promise<Order | null> {
  const { data } = await adminClient().from("orders").select("*").eq("entry_id", entryId).eq("kind", "pre").maybeSingle();
  return data ? toOrder(data as OrderRow) : null;
}

/** Called when a guest leaves or is marked no-show: drops orders the kitchen hasn't accepted. */
export async function cancelOpenOrder(entryId: string) {
  await adminClient()
    .from("orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("entry_id", entryId)
    .eq("kind", "pre")
    .eq("status", "submitted");
}

export async function saveOrder(entry: { id: string; restaurantId: string }, b: Record<string, unknown>): Promise<Result> {
  const raw = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
  const items = raw
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((x) => typeof x.id === "string" && UUID.test(x.id))
    .map((x) => ({ id: x.id as string, qty: Math.max(1, Math.min(20, Math.round(Number(x.qty) || 1))) }));
  if (!items.length) return fail("empty", 400);
  const { error } = await adminClient()
    .rpc("tp_save_order", { p_entry_id: entry.id, p_items: items, p_note: str(b.note, 200) })
    .single();
  if (error) return dbFail(error.message);
  await broadcastChange(entry.restaurantId);
  return { ok: true, value: undefined };
}

export async function guestCancelOrder(entry: { id: string; restaurantId: string }): Promise<Result> {
  const { data, error } = await adminClient()
    .from("orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("entry_id", entry.id)
    .eq("kind", "pre")
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();
  if (error) return dbFail(error.message);
  if (!data) return fail("order_locked", 409);
  await broadcastChange(entry.restaurantId);
  return { ok: true, value: undefined };
}

export async function hostOrderAction(r: Restaurant, orderId: string, action: "accept" | "cancel"): Promise<Result> {
  if (!UUID.test(orderId)) return fail("not_found", 404);
  const { data, error } = await adminClient()
    .from("orders")
    .update({ status: action === "accept" ? "accepted" : "cancelled", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("restaurant_id", r.id)
    .in("status", action === "accept" ? ["submitted"] : ["submitted", "accepted"])
    .select("id")
    .maybeSingle();
  if (error) return dbFail(error.message);
  if (!data) return fail("not_found", 404);
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Ordering at the table (after being seated)
// ---------------------------------------------------------------------------

/** How long after seating a table stays open for ordering, unless the host closes it first. */
export const TABLE_HOURS = 6;

export const tableIsOpen = (e: { status: string; closedAt: number | null; tableClosedAt?: number | null }, now = Date.now()) =>
  e.status === "seated" && !e.tableClosedAt && e.closedAt !== null && e.closedAt > now - TABLE_HOURS * 3_600_000;

/** Every order of the given tickets (pre-order and table rounds), oldest first, keyed by ticket id. */
export async function allOrdersForEntries(entryIds: string[], includeCancelled = false): Promise<Map<string, Order[]>> {
  const map = new Map<string, Order[]>();
  if (!entryIds.length) return map;
  let q = adminClient().from("orders").select("*").in("entry_id", entryIds);
  if (!includeCancelled) q = q.neq("status", "cancelled");
  const { data } = await q.order("created_at");
  for (const row of (data ?? []) as OrderRow[]) {
    const list = map.get(row.entry_id) ?? [];
    list.push(toOrder(row));
    map.set(row.entry_id, list);
  }
  return map;
}

function cartOf(b: Record<string, unknown>) {
  const raw = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
  return raw
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((x) => typeof x.id === "string" && UUID.test(x.id))
    .map((x) => ({ id: x.id as string, qty: Math.max(1, Math.min(20, Math.round(Number(x.qty) || 1))) }));
}

export async function saveTableOrder(entry: { id: string; restaurantId: string }, b: Record<string, unknown>): Promise<Result> {
  const items = cartOf(b);
  if (!items.length) return fail("empty", 400);
  const { error } = await adminClient()
    .rpc("tp_table_order", { p_entry_id: entry.id, p_items: items, p_note: str(b.note, 200), p_hours: TABLE_HOURS })
    .single();
  if (error) return dbFail(error.message);
  await broadcastChange(entry.restaurantId);
  return { ok: true, value: undefined };
}

/** Guest withdraws the table order the restaurant hasn't accepted yet. */
export async function guestCancelTableOrder(entry: { id: string; restaurantId: string }): Promise<Result> {
  const { data, error } = await adminClient()
    .from("orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("entry_id", entry.id)
    .eq("kind", "table")
    .eq("status", "submitted")
    .select("id");
  if (error) return dbFail(error.message);
  if (!data?.length) return fail("order_locked", 409);
  await broadcastChange(entry.restaurantId);
  return { ok: true, value: undefined };
}

/** Host closes a table (guest paid / left) or writes its table number. */
export async function updateTable(r: Restaurant, entryId: string, b: Record<string, unknown>): Promise<Result> {
  if (!UUID.test(entryId)) return fail("not_found", 404);
  const patch: Record<string, unknown> = {};
  if (typeof b.label === "string") patch.table_label = str(b.label, 12);
  if (b.close === true) patch.table_closed_at = new Date().toISOString();
  if (!Object.keys(patch).length) return fail("invalid", 400);
  const { data, error } = await adminClient()
    .from("entries")
    .update(patch)
    .eq("id", entryId)
    .eq("restaurant_id", r.id)
    .eq("status", "seated")
    .select("id")
    .maybeSingle();
  if (error) return dbFail(error.message);
  if (!data) return fail("not_found", 404);
  if (b.close === true) {
    // Anything still waiting for the kitchen is dropped when the table closes.
    await adminClient().from("orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("entry_id", entryId).eq("status", "submitted");
  }
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}
