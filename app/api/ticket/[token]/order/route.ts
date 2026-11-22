import { fail, json, readBody } from "@/lib/api";
import { guestCancelOrder, saveOrder } from "@/lib/menu";
import { entryByToken } from "@/lib/queue";

type Ctx = { params: Promise<{ token: string }> };

/** Create or replace the guest's pre-order: { items: [{ id, qty }], note } */
export async function PUT(req: Request, { params }: Ctx) {
  const { token } = await params;
  const entry = await entryByToken(token);
  if (!entry) return fail("not_found", 404);
  const res = await saveOrder(entry, await readBody(req));
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}

/** Guest cancels a pre-order the restaurant hasn't accepted yet. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const entry = await entryByToken(token);
  if (!entry) return fail("not_found", 404);
  const res = await guestCancelOrder(entry);
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}
