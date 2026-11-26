import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { adminClient } from "./supabase/admin";
import { toRestaurant, type RestaurantRow } from "./queue";
import { can, homeFor, type Permission } from "./permissions";
import type { Restaurant, Staff } from "./types";

export interface StaffContext {
  staff: Staff;
  restaurant: Restaurant;
}

/**
 * The logged-in staff member and their restaurant, or null.
 * getUser() checks the token with Supabase, so a forged cookie can't pass.
 * Cached per request, so pages and the top bar share one lookup.
 */
export const getStaff = cache(async (): Promise<StaffContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Staff row and restaurant in one round trip (saves a second database call on every staff page).
  const { data: row } = await adminClient().from("staff").select("name, role, phone, restaurant:restaurants(*)").eq("user_id", user.id).maybeSingle();
  if (!row || !row.restaurant) return null;
  const restaurant = toRestaurant(row.restaurant as unknown as RestaurantRow);

  return {
    staff: {
      userId: user.id,
      email: user.email ?? "",
      name: row.name as string,
      restaurantId: restaurant.id,
      role: row.role as Staff["role"],
      phone: (row.phone as string | null) ?? "",
    },
    restaurant,
  };
});

export async function requireStaff(permission?: Permission): Promise<StaffContext> {
  const ctx = await getStaff();
  if (!ctx) redirect("/login");
  // A page this role can't use sends them to their own first screen.
  if (permission && !can(ctx.staff.role, permission)) redirect(homeFor(ctx.staff.role));
  return ctx;
}
