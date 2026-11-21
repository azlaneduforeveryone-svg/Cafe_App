import { fail } from "@/lib/api";
import { sseResponse } from "@/lib/events";
import { entryByToken, ticketSnapshot } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const entry = entryByToken(token);
  if (!entry) return fail("not_found", 404);
  return sseResponse(req, entry.restaurantId, () => ticketSnapshot(token));
}
