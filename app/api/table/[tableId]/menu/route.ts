import { fail } from "@/lib/api";
import { getMenu } from "@/lib/menu";
import { guestSession, tableWithRestaurant } from "@/lib/tables";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  const s = await guestSession(tableId);
  const tr = s ? await tableWithRestaurant(tableId) : null;
  if (!s || !tr) return fail("not_found", 404);
  return Response.json(await getMenu(tr.restaurant), { headers: { "Cache-Control": "no-store" } });
}
