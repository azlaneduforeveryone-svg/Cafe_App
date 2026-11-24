import { fail, json, readBody, withStaff } from "@/lib/api";
import { markPaid } from "@/lib/bills";

/** Staff confirm payment: { sessionId } for a table, or { entryId } for a seated ticket, plus optional { method }. */
export async function POST(req: Request) {
  return withStaff(async ({ restaurant }) => {
    const res = await markPaid(restaurant, await readBody(req));
    return res.ok ? json({ ok: true, ...res.value }) : fail(res.error, res.status);
  });
}
