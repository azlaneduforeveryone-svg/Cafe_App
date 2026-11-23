import { fail } from "@/lib/api";
import { guestSessionAny, guestSnapshot } from "@/lib/tables";

export const dynamic = "force-dynamic";

/** Live snapshot for the guest's phone. Without a valid session cookie: 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  const s = await guestSessionAny(tableId);
  if (!s) return fail("not_found", 404);
  const snap = await guestSnapshot(tableId, s);
  if (!snap) return fail("not_found", 404);
  return Response.json(snap, { headers: { "Cache-Control": "no-store" } });
}
