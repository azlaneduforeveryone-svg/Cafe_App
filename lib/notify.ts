import "server-only";
import { adminClient } from "./supabase/admin";
import { broadcastChange } from "./realtime";
import type { Restaurant } from "./types";

/**
 * Kitchen → floor notifications. Each goes to the table's assigned waiter; when the table has no
 * waiter, to every waiter; with no waiters at all, to the managers and owner. Waitlist pre-orders
 * (no table yet) go to reception. Shown on the Floor and waitlist screens with a sound.
 */

type Line = { qty?: number; nameEn?: string; station?: string };
interface OrderRow {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  entry_id: string | null;
  items: Line[];
  ready_at: string | null;
}

async function staffWithRoles(r: Restaurant, roles: string[]): Promise<string[]> {
  const { data } = await adminClient().from("staff").select("user_id").eq("restaurant_id", r.id).in("role", roles);
  return ((data ?? []) as { user_id: string }[]).map((x) => x.user_id);
}

async function recipients(r: Restaurant, tableId: string | null): Promise<{ ids: string[]; label: string }> {
  const db = adminClient();
  if (tableId) {
    const { data } = await db.from("restaurant_tables").select("table_number, assigned_staff_id").eq("id", tableId).maybeSingle();
    const t = data as { table_number: string; assigned_staff_id: string | null } | null;
    if (t?.assigned_staff_id) return { ids: [t.assigned_staff_id], label: t.table_number };
    const waiters = await staffWithRoles(r, ["waiter"]);
    return { ids: waiters.length ? waiters : await staffWithRoles(r, ["manager", "owner"]), label: t?.table_number ?? "" };
  }
  const reception = await staffWithRoles(r, ["reception"]);
  return { ids: reception.length ? reception : await staffWithRoles(r, ["manager", "owner"]), label: "" };
}

async function entryLabel(entryId: string | null) {
  if (!entryId) return "";
  const { data } = await adminClient().from("entries").select("ticket_number, name").eq("id", entryId).maybeSingle();
  const e = data as { ticket_number: number; name: string } | null;
  return e ? `#${e.ticket_number} ${e.name}`.slice(0, 40) : "";
}

const lineText = (lines: Line[]) =>
  lines
    .map((l) => `${l.qty ?? 1}× ${l.nameEn ?? ""}`)
    .join(", ")
    .slice(0, 180);

async function send(r: Restaurant, ids: string[], row: { kind: "ready" | "out_of_stock"; table_label: string; body: string; order_id: string | null }) {
  if (!ids.length) return;
  await adminClient()
    .from("staff_notifications")
    .insert([...new Set(ids)].map((staff_id) => ({ restaurant_id: r.id, staff_id, ...row })));
}

/** A station marked its part of an order ready (and maybe the whole order). */
export async function notifyReady(r: Restaurant, order: OrderRow, station: string) {
  try {
    const { ids, label } = await recipients(r, order.table_id);
    const where = label || (await entryLabel(order.entry_id));
    const part = (order.items ?? []).filter((l) => (l.station ?? "") === station);
    await send(r, ids, { kind: "ready", table_label: where, body: lineText(part.length ? part : order.items ?? []), order_id: order.id });
    await broadcastChange(r.id);
  } catch {
    /* never block the kitchen */
  }
}

/** A dish went out of stock: tell the waiters of tables with that dish still to come. */
export async function notifyOutOfStock(r: Restaurant, itemId: string) {
  try {
    const db = adminClient();
    const { data: item } = await db.from("menu_items").select("name_en").eq("id", itemId).eq("restaurant_id", r.id).maybeSingle();
    if (!item) return;
    const name = (item as { name_en: string }).name_en;
    const since = new Date(Date.now() - 8 * 3_600_000).toISOString();
    const { data: open } = await db
      .from("orders")
      .select("id, restaurant_id, table_id, entry_id, items, ready_at")
      .eq("restaurant_id", r.id)
      .in("status", ["submitted", "accepted"])
      .is("served_at", null)
      .gte("created_at", since);
    const hit = ((open ?? []) as OrderRow[]).filter((o) => (o.items ?? []).some((l) => (l as { id?: string }).id === itemId));
    for (const o of hit) {
      const { ids, label } = await recipients(r, o.table_id);
      await send(r, ids, { kind: "out_of_stock", table_label: label || (await entryLabel(o.entry_id)), body: name.slice(0, 180), order_id: o.id });
    }
    if (hit.length) await broadcastChange(r.id);
  } catch {
    /* never block the kitchen */
  }
}

export interface InboxItem {
  id: number;
  kind: "ready" | "out_of_stock";
  table: string;
  body: string;
  at: number;
}

/** Unread notifications for one person, last 3 hours. */
export async function inbox(staffId: string): Promise<InboxItem[]> {
  const { data } = await adminClient()
    .from("staff_notifications")
    .select("id, kind, table_label, body, created_at")
    .eq("staff_id", staffId)
    .is("read_at", null)
    .gte("created_at", new Date(Date.now() - 3 * 3_600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as { id: number; kind: InboxItem["kind"]; table_label: string; body: string; created_at: string }[]).map((n) => ({
    id: n.id,
    kind: n.kind,
    table: n.table_label,
    body: n.body,
    at: Date.parse(n.created_at),
  }));
}

export async function markRead(staffId: string, ids: unknown) {
  const db = adminClient().from("staff_notifications").update({ read_at: new Date().toISOString() }).eq("staff_id", staffId).is("read_at", null);
  if (Array.isArray(ids)) {
    const list = ids.filter((x): x is number => Number.isInteger(x)).slice(0, 50);
    if (!list.length) return;
    await db.in("id", list);
  } else await db;
}
