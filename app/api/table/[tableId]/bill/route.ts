import { fail, json, readBody } from "@/lib/api";
import { rateBill, requestBill } from "@/lib/bills";
import { billSourceOf, guestSessionAny, tableWithRestaurant } from "@/lib/tables";

type Ctx = { params: Promise<{ tableId: string }> };

/**
 * { action: "request", tipPct, split, method }: ask for the bill (or change it before paying).
 * { action: "rate", stars, comment }: rate the visit after paying.
 * Amounts are never taken from the phone.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { tableId } = await params;
  const s = await guestSessionAny(tableId);
  if (!s) return fail("table_closed", 409);
  const b = await readBody(req);
  const src = billSourceOf(s);
  if (b.action === "request") {
    const tr = await tableWithRestaurant(tableId);
    if (!tr) return fail("not_found", 404);
    const res = await requestBill(src, tr.restaurant.country, b);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  }
  if (b.action === "rate") {
    const res = await rateBill(src, b);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  }
  return fail("bad_action", 400);
}
