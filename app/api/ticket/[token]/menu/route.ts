import { fail } from "@/lib/api";
import { getMenu } from "@/lib/menu";
import { entryByToken, getRestaurantById } from "@/lib/queue";

export const dynamic = "force-dynamic";

/** The menu a waiting guest can order from (available dishes only). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const entry = await entryByToken(token);
  if (!entry) return fail("not_found", 404);
  const r = await getRestaurantById(entry.restaurantId);
  if (!r) return fail("not_found", 404);
  return Response.json(await getMenu(r), { headers: { "Cache-Control": "no-store" } });
}
