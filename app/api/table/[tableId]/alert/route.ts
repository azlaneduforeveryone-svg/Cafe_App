import { fail, json, readBody } from "@/lib/api";
import { guestSession, raiseAlert } from "@/lib/tables";
import { clientIp, overLimit, tooMany } from "@/lib/rateLimit";

/** Call waiter: { type: "water" | "napkins" | "bill" | "help" } */
export async function POST(req: Request, { params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  // Stops someone with a photo of the QR from spamming staff with calls.
  if (await overLimit({ key: `alert:${tableId}:${await clientIp()}`, windowSec: 600, max: 12 })) return tooMany(600);
  const s = await guestSession(tableId);
  if (!s) return fail("table_closed", 409);
  const { type } = await readBody(req);
  const res = await raiseAlert(s, type);
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}
