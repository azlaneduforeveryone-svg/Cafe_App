import { fail, json, readBody, withStaff } from "@/lib/api";
import { requestCancel, undoCancel } from "@/lib/billing";

export const dynamic = "force-dynamic";

/** POST {} asks to stop renewal; POST { undo: true } keeps the subscription. */
export async function POST(req: Request) {
  const { undo } = await readBody(req);
  return withStaff("billing.manage", async (ctx) => {
    const res = undo === true ? await undoCancel(ctx) : await requestCancel(ctx);
    if (!res.ok) return fail(res.error, res.status);
    return json({ ok: true });
  });
}
