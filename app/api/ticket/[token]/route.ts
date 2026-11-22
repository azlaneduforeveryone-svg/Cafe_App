import { fail, json, readBody } from "@/lib/api";
import { guestAction, ticketSnapshot } from "@/lib/queue";

export const dynamic = "force-dynamic";

/** The guest's phone reloads this whenever a live ping arrives. The token is the only key. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const snap = await ticketSnapshot(token);
  if (!snap) return fail("not_found", 404);
  return Response.json(snap, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { action } = await readBody(req);
  if (action !== "on_way" && action !== "leave") return fail("bad_action", 400);
  const res = await guestAction(token, action);
  if (!res.ok) return fail(res.error, res.status);
  return json({ ok: true });
}
