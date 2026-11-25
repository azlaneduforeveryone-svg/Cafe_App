import "server-only";
import { logActivity } from "./activity";
import type { StaffContext } from "./auth";
import { broadcastChange } from "./realtime";
import { normaliseAnyPhone } from "./staff";
import { adminClient } from "./supabase/admin";

/**
 * Business details. Guest-facing phone and address: anyone with settings.manage.
 * Legal name, CR and VAT: the owner only (permission business.legal). The activity
 * log records which legal field changed, never its value, because managers can read the log.
 */

type Result = { ok: true } | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
const CODE = /^[A-Za-z0-9-]{0,30}$/;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function updateContact(ctx: StaffContext, b: Record<string, unknown>): Promise<Result> {
  const address = clean(b.address, 200);
  const city = clean(b.city, 60);
  const raw = clean(b.phone, 40);
  let phone = "";
  if (raw) {
    phone = (await normaliseAnyPhone(raw)) ?? "";
    if (!phone) return fail("bad_phone");
  }
  const before = ctx.restaurant.contact;
  const { error } = await adminClient().from("restaurants").update({ business_phone: phone, address, city }).eq("id", ctx.restaurant.id);
  if (error) return fail("server_error", 500);
  const fields = (["phone", "address", "city"] as const).filter((k) => before[k] !== { phone, address, city }[k]);
  if (fields.length) await logActivity(ctx, "contact_changed", fields.join(", "));
  await broadcastChange(ctx.restaurant.id);
  return { ok: true };
}

export async function updateLegal(ctx: StaffContext, b: Record<string, unknown>): Promise<Result> {
  if (ctx.staff.role !== "owner") return fail("forbidden", 403); // second lock behind the permission check
  const legalName = clean(b.legalName, 120);
  const crNumber = clean(b.crNumber, 30);
  const vatNumber = clean(b.vatNumber, 30);
  if (!CODE.test(crNumber) || !CODE.test(vatNumber)) return fail("bad_code");
  const before = ctx.restaurant.business;
  const { error } = await adminClient().from("restaurants").update({ legal_name: legalName, cr_number: crNumber, vat_number: vatNumber }).eq("id", ctx.restaurant.id);
  if (error) return fail("server_error", 500);
  const after = { legalName, crNumber, vatNumber };
  const names = { legalName: "legal name", crNumber: "CR", vatNumber: "VAT" } as const;
  const fields = (Object.keys(names) as (keyof typeof names)[]).filter((k) => before[k] !== after[k]).map((k) => names[k]);
  if (fields.length) await logActivity(ctx, "legal_changed", fields.join(", "));
  return { ok: true };
}
