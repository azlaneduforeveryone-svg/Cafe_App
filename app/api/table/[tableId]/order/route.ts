import { fail, json, readBody } from "@/lib/api";
import { guestSession, sessionCancelOrder, sessionOrder } from "@/lib/tables";
import { clientIp, overLimit, tooMany } from "@/lib/rateLimit";

type Ctx = { params: Promise<{ tableId: string }> };

/** Order from the table: { items: [{ id, qty }], note }. Waits for staff approval. */
export async function PUT(req: Request, { params }: Ctx) {
  const { tableId } = await params;
  if (await overLimit({ key: `torder:${tableId}:${await clientIp()}`, windowSec: 600, max: 20 })) return tooMany(600);
  const s = await guestSession(tableId);
  if (!s) return fail("table_closed", 409);
  const res = await sessionOrder(s, await readBody(req));
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { tableId } = await params;
  const s = await guestSession(tableId);
  if (!s) return fail("table_closed", 409);
  const res = await sessionCancelOrder(s);
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}
