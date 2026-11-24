import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { StaffContext } from "./auth";
import { kitchenSnapshot } from "./menu";
import { getRestaurantById } from "./queue";
import { adminClient } from "./supabase/admin";
import type { Restaurant } from "./types";

/**
 * Locked kitchen display screens. A manager switches a tablet into kitchen mode; the tablet then
 * holds only a device token (httpOnly cookie, hash stored) that can mark dishes ready and mark a
 * dish out of stock. No staff login stays on the tablet. Revoked devices stop at once.
 */

export const DEVICE_COOKIE = "tp_kd";
const DEVICE_DAYS = 400;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface KitchenDevice {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number | null;
}

export async function createDevice(ctx: StaffContext, name: unknown): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const label = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  const db = adminClient();
  const { count } = await db.from("kitchen_devices").select("id", { count: "exact", head: true }).eq("restaurant_id", ctx.restaurant.id).is("revoked_at", null);
  if ((count ?? 0) >= 10) return { ok: false, error: "too_many" };
  const token = randomBytes(32).toString("base64url");
  const { error } = await db.from("kitchen_devices").insert({ restaurant_id: ctx.restaurant.id, name: label || "Kitchen", token_hash: hash(token), created_by: ctx.staff.userId });
  return error ? { ok: false, error: "server_error" } : { ok: true, token };
}

export const deviceCookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: DEVICE_DAYS * 86_400 });

/** The kitchen display this browser is, or null. */
export async function getDevice(): Promise<{ device: KitchenDevice; restaurant: Restaurant } | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value ?? "";
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const db = adminClient();
  const { data } = await db.from("kitchen_devices").select("*").eq("token_hash", hash(token)).is("revoked_at", null).maybeSingle();
  const d = data as { id: string; restaurant_id: string; name: string; created_at: string; last_seen_at: string | null } | null;
  if (!d) return null;
  const restaurant = await getRestaurantById(d.restaurant_id);
  if (!restaurant) return null;
  if (!d.last_seen_at || Date.parse(d.last_seen_at) < Date.now() - 60_000) {
    await db.from("kitchen_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", d.id);
  }
  return { device: { id: d.id, name: d.name, createdAt: Date.parse(d.created_at), lastSeenAt: d.last_seen_at ? Date.parse(d.last_seen_at) : null }, restaurant };
}

export async function listDevices(restaurantId: string): Promise<KitchenDevice[]> {
  const { data } = await adminClient().from("kitchen_devices").select("id, name, created_at, last_seen_at").eq("restaurant_id", restaurantId).is("revoked_at", null).order("created_at");
  return ((data ?? []) as { id: string; name: string; created_at: string; last_seen_at: string | null }[]).map((d) => ({
    id: d.id,
    name: d.name,
    createdAt: Date.parse(d.created_at),
    lastSeenAt: d.last_seen_at ? Date.parse(d.last_seen_at) : null,
  }));
}

export async function revokeDevice(ctx: StaffContext, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const { data } = await adminClient().from("kitchen_devices").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("restaurant_id", ctx.restaurant.id).is("revoked_at", null).select("id").maybeSingle();
  return !!data;
}

/** Log a kitchen display action (no staff login: the device name is recorded). */
export async function logDevice(restaurantId: string, device: KitchenDevice, action: string, target: string, detail: Record<string, unknown> = {}) {
  try {
    await adminClient().from("staff_activity").insert({ restaurant_id: restaurantId, staff_id: null, staff_name: device.name, staff_role: "kitchen", action, target: target.slice(0, 120), detail });
  } catch {
    /* never block the kitchen */
  }
}

/** What a kitchen display may see: tickets without prices, and the dishes it can mark out of stock. */
export async function deviceSnapshot(d: { device: KitchenDevice; restaurant: Restaurant }) {
  const snap = await kitchenSnapshot(d.restaurant);
  const { data: items } = await adminClient().from("menu_items").select("id, name_en, name_ar, name_ur, station, available").eq("restaurant_id", d.restaurant.id).order("sort");
  return {
    ...snap,
    device: d.device.name,
    tickets: snap.tickets.map((tk) => ({ ...tk, lines: tk.lines.map((l) => ({ ...l, price: 0 })) })),
    dishes: ((items ?? []) as { id: string; name_en: string; name_ar: string; name_ur: string; station: string; available: boolean }[]).map((i) => ({
      id: i.id,
      nameEn: i.name_en,
      nameAr: i.name_ar,
      nameUr: i.name_ur,
      station: i.station,
      inStock: i.available,
    })),
  };
}
