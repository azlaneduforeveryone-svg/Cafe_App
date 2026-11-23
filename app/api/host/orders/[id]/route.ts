import { fail, json, readBody, withStaff } from "@/lib/api";
import { hostOrderAction, markServed } from "@/lib/menu";

/** { action: "accept" } sends it to the kitchen, "cancel" rejects it, "served" marks it brought to the table. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await readBody(req);
  if (action !== "accept" && action !== "cancel" && action !== "served") return fail("bad_action", 400);
  return withStaff(async ({ restaurant }) => {
    const res = action === "served" ? await markServed(restaurant, id) : await hostOrderAction(restaurant, id, action);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
