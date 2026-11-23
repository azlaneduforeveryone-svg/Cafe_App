import { fail, json, readBody } from "@/lib/api";
import { guestSession, raiseAlert } from "@/lib/tables";

/** Call waiter: { type: "water" | "napkins" | "bill" | "help" } */
export async function POST(req: Request, { params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  const s = await guestSession(tableId);
  if (!s) return fail("table_closed", 409);
  const { type } = await readBody(req);
  const res = await raiseAlert(s, type);
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}
