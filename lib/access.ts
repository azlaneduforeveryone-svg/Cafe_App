import "server-only";
import type { StaffContext } from "./auth";
import { adminClient } from "./supabase/admin";

/**
 * Table-level limits on top of role permissions: when the manager sets "waiters see only their
 * assigned tables", a waiter can act only on tables assigned to them. Everyone else: no limit.
 */
export const limitedToAssigned = (ctx: StaffContext) => ctx.staff.role === "waiter" && ctx.restaurant.waiterScope === "assigned";

export async function mayUseTable(ctx: StaffContext, tableId: string | null | undefined): Promise<boolean> {
  if (!limitedToAssigned(ctx)) return true;
  if (!tableId) return true; // waitlist orders with no table
  const { data } = await adminClient().from("restaurant_tables").select("assigned_staff_id").eq("id", tableId).eq("restaurant_id", ctx.restaurant.id).maybeSingle();
  return (data as { assigned_staff_id: string | null } | null)?.assigned_staff_id === ctx.staff.userId;
}

export async function tableOfOrder(ctx: StaffContext, orderId: string) {
  const { data } = await adminClient().from("orders").select("table_id, kind, items, total").eq("id", orderId).eq("restaurant_id", ctx.restaurant.id).maybeSingle();
  return (data as { table_id: string | null; kind: "pre" | "table"; items: { nameEn?: string; qty?: number }[]; total: number | string } | null) ?? null;
}
