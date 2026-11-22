import { fail, json, readBody, withStaff } from "@/lib/api";
import { hostOrderAction } from "@/lib/menu";

/** Host accepts (locks) or cancels a guest's pre-order. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await readBody(req);
  if (action !== "accept" && action !== "cancel") return fail("bad_action", 400);
  return withStaff(async ({ restaurant }) => {
    const res = await hostOrderAction(restaurant, id, action);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
