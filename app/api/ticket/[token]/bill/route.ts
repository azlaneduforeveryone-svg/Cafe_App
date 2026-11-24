import { fail, json, readBody } from "@/lib/api";
import { rateBill, requestBill, sourceForEntry } from "@/lib/bills";
import { entryByToken, getRestaurantById } from "@/lib/queue";

type Ctx = { params: Promise<{ token: string }> };

/** Same as the table bill, for a seated waitlist guest: { action: "request" | "rate", ... }. */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const e = await entryByToken(token);
  if (!e || e.status !== "seated") return fail("not_found", 404);
  const b = await readBody(req);
  const src = await sourceForEntry(e);
  if (b.action === "request") {
    const r = await getRestaurantById(e.restaurantId);
    if (!r) return fail("not_found", 404);
    const res = await requestBill(src, r, b);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  }
  if (b.action === "rate") {
    const res = await rateBill(src, b);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  }
  return fail("bad_action", 400);
}
