import "server-only";
import type { StaffContext } from "./auth";
import { adminClient } from "./supabase/admin";

/**
 * Who did what, for the owner and manager. Written after the action succeeded; a failed
 * write never blocks the action itself (the action already happened).
 */
export type ActivityAction =
  | "bill_paid"
  | "reward_given"
  | "order_accepted"
  | "order_cancelled"
  | "dish_added"
  | "dish_changed"
  | "price_changed"
  | "dish_deleted"
  | "stock_changed"
  | "table_closed"
  | "member_deleted"
  | "staff_invited"
  | "staff_removed"
  | "staff_role_changed"
  | "invite_revoked"
  | "settings_changed"
  | "contact_changed"
  | "legal_changed";

export async function logActivity(ctx: StaffContext, action: ActivityAction, target = "", detail: Record<string, unknown> = {}) {
  try {
    await adminClient()
      .from("staff_activity")
      .insert({ restaurant_id: ctx.restaurant.id, staff_id: ctx.staff.userId, staff_name: ctx.staff.name, staff_role: ctx.staff.role, action, target: target.slice(0, 120), detail });
  } catch {
    /* never block the action */
  }
}

export interface ActivityRow {
  id: number;
  staffName: string;
  staffRole: string;
  action: ActivityAction | "staff_joined";
  target: string;
  detail: Record<string, unknown>;
  at: number;
}

export async function listActivity(restaurantId: string, limit = 200): Promise<ActivityRow[]> {
  const { data } = await adminClient().from("staff_activity").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(limit);
  return ((data ?? []) as { id: number; staff_name: string; staff_role: string; action: ActivityRow["action"]; target: string; detail: Record<string, unknown>; created_at: string }[]).map((r) => ({
    id: r.id,
    staffName: r.staff_name,
    staffRole: r.staff_role,
    action: r.action,
    target: r.target,
    detail: r.detail ?? {},
    at: Date.parse(r.created_at),
  }));
}
