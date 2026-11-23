import { fail, json, readBody } from "@/lib/api";
import { guestCancelTableOrder, saveTableOrder } from "@/lib/menu";
import { entryByToken } from "@/lib/queue";

type Ctx = { params: Promise<{ token: string }> };

/** Seated guest orders at the table: { items: [{ id, qty }], note }. Replaces a round not yet accepted. */
export async function PUT(req: Request, { params }: Ctx) {
  const { token } = await params;
  const entry = await entryByToken(token);
  if (!entry) return fail("not_found", 404);
  const res = await saveTableOrder(entry, await readBody(req));
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}

/** Guest withdraws the round the restaurant hasn't accepted yet. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const entry = await entryByToken(token);
  if (!entry) return fail("not_found", 404);
  const res = await guestCancelTableOrder(entry);
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}
