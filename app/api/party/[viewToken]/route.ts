import { fail } from "@/lib/api";
import { partySnapshot } from "@/lib/queue";

export const dynamic = "force-dynamic";

/** View-only party link: watch the ticket. There is no POST, so it can't leave the line or order. */
export async function GET(_req: Request, { params }: { params: Promise<{ viewToken: string }> }) {
  const { viewToken } = await params;
  const snap = await partySnapshot(viewToken);
  if (!snap) return fail("not_found", 404);
  return Response.json(snap, { headers: { "Cache-Control": "no-store" } });
}
