"use server";

import { notFound } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { isAdminEmail } from "@/lib/billing";
import { createClientRestaurant, newOwnerLink, type OwnerLink } from "@/lib/clients";

export type ClientActionResult = { ok: true; value: OwnerLink } | { ok: false; error: string };

async function requireAdmin() {
  const ctx = await getStaff();
  if (!ctx || !isAdminEmail(ctx.staff.email)) notFound();
  return ctx;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function createClientAction(f: FormData): Promise<ClientActionResult> {
  const admin = await requireAdmin();
  const logo = f.get("logo");
  return createClientRestaurant(
    admin,
    {
      name: str(f, "name"),
      nameAr: str(f, "nameAr"),
      nameUr: str(f, "nameUr"),
      country: str(f, "country"),
      ownerName: str(f, "ownerName"),
      ownerContact: str(f, "ownerContact"),
      legalName: str(f, "legalName"),
      crNumber: str(f, "crNumber"),
      vatNumber: str(f, "vatNumber"),
      businessPhone: str(f, "businessPhone"),
      address: str(f, "address"),
      city: str(f, "city"),
    },
    logo instanceof File ? logo : null,
  );
}

export async function newOwnerLinkAction(restaurantId: string): Promise<ClientActionResult> {
  const admin = await requireAdmin();
  return newOwnerLink(admin, restaurantId);
}
