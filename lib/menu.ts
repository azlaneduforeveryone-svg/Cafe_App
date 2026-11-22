import "server-only";
import { adminClient } from "./supabase/admin";
import { broadcastChange } from "./realtime";
import { deleteImage, ownsPath, publicUrl } from "./media";
import { PRICING } from "./pricing";
import type { Menu, MenuCategory, MenuItem, Order, OrderLine, OrderStatus, Restaurant } from "./types";

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string; status: number };
const fail = (error: string, status: number) => ({ ok: false as const, error, status });

function dbFail(message: string | undefined) {
  const m = message ?? "";
  for (const code of ["not_active", "order_locked", "empty", "too_many", "item_unavailable"]) {
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
  sort: number;
}
interface OrderRow {
  id: string;
  entry_id: string;
  status: OrderStatus;
  items: OrderLine[];
  total: string | number;
  note: string;
  updated_at: string;
}

const toCategory = (r: CategoryRow): MenuCategory => ({ id: r.id, nameEn: r.name_en, nameAr: r.name_ar, nameUr: r.name_ur, sort: r.sort });
const toItem = (r: ItemRow): MenuItem => ({
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
  sort: r.sort,
});
export const toOrder = (r: OrderRow): Order => ({
  id: r.id,
  status: r.status,
  items: (r.items ?? []).map((l) => ({ ...l, price: Number(l.price) })),
  total: Number(r.total),
  note: r.note,
  updatedAt: Date.parse(r.updated_at),
});

// ---------------------------------------------------------------------------
// Menu reads
// ---------------------------------------------------------------------------

/** Guests see only available dishes; the editor sees everything. */
export async function getMenu(r: Restaurant, opts: { includeHidden?: boolean } = {}): Promise<Menu> {
  let items = adminClient().from("menu_items").select("*").eq("restaurant_id", r.id);
  if (!opts.includeHidden) items = items.eq("available", true);
  const [cats, its] = await Promise.all([
    adminClient().from("menu_categories").select("*").eq("restaurant_id", r.id).order("sort").order("created_at"),
    items.order("sort").order("created_at"),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (its.error) throw new Error(its.error.message);
  return {
    currency: currencyOf(r),
    categories: (cats.data as CategoryRow[]).map(toCategory),
    items: (its.data as ItemRow[]).map(toItem),
  };
}

/** Whether guests have anything to order from. */
export async function hasMenu(restaurantId: string): Promise<boolean> {
  const { count } = await adminClient()
    .from("menu_items")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("available", true);
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function categoryInput(b: Record<string, unknown>) {
  const v = { name_en: str(b.nameEn, 40), name_ar: str(b.nameAr, 40), name_ur: str(b.nameUr, 40) };
  return v.name_en && v.name_ar && v.name_ur ? v : null;
}

export async function createCategory(r: Restaurant, b: Record<string, unknown>): Promise<Result> {
  const v = categoryInput(b);
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
  const v = categoryInput(b);
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
    available: b.available !== false,
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
  const { error } = await adminClient().from("menu_items").insert({ ...input.value, restaurant_id: r.id, sort: count ?? 0 });
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

/** Quick show/hide from the list (e.g. sold out tonight). */
export async function setItemAvailable(r: Restaurant, id: string, available: boolean): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  const { data, error } = await adminClient().from("menu_items").update({ available }).eq("id", id).eq("restaurant_id", r.id).select("id").maybeSingle();
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
  const { data } = await adminClient().from("orders").select("*").in("entry_id", entryIds).neq("status", "cancelled");
  for (const row of (data ?? []) as OrderRow[]) map.set(row.entry_id, toOrder(row));
  return map;
}

export async function orderForEntry(entryId: string): Promise<Order | null> {
  const { data } = await adminClient().from("orders").select("*").eq("entry_id", entryId).maybeSingle();
  return data ? toOrder(data as OrderRow) : null;
}

/** Called when a guest leaves or is marked no-show: drops orders the kitchen hasn't accepted. */
export async function cancelOpenOrder(entryId: string) {
  await adminClient().from("orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("entry_id", entryId).eq("status", "submitted");
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
