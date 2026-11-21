import "server-only";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getSessionStaffId } from "./session";
import type { Restaurant, Staff } from "./types";

export interface StaffContext {
  staff: Staff;
  restaurant: Restaurant;
}

export async function getStaff(): Promise<StaffContext | null> {
  const id = await getSessionStaffId();
  if (!id) return null;
  const data = db();
  const staff = data.staff.find((s) => s.id === id);
  if (!staff) return null;
  const restaurant = data.restaurants.find((r) => r.id === staff.restaurantId);
  if (!restaurant) return null;
  return { staff, restaurant };
}

export async function requireStaff(): Promise<StaffContext> {
  const ctx = await getStaff();
  if (!ctx) redirect("/login");
  return ctx;
}
