import { mayUseTable, tableOfOrder } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { fail, json, readBody, withStaff } from "@/lib/api";
import { can } from "@/lib/permissions";
import { hostOrderAction, markServed } from "@/lib/menu";

/** { action: "accept" } sends it to the kitchen, "cancel" rejects it, "served" marks it brought to the table. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await readBody(req);
  if (action !== "accept" && action !== "cancel" && action !== "served") return fail("bad_action", 400);
  return withStaff(["orders.pre", "orders.table", "orders.serve"], async (ctx) => {
    const { restaurant } = ctx;
    const o = await tableOfOrder(ctx, id);
    if (!o) return fail("not_found", 404);
    // Served needs orders.serve; accepting or cancelling needs the permission for that kind of order.
    const need = action === "served" ? "orders.serve" : o.kind === "table" ? "orders.table" : "orders.pre";
    if (!can(ctx.staff.role, need)) return fail("forbidden", 403);
    if (!(await mayUseTable(ctx, o.table_id))) return fail("not_your_table", 403);
    const res = action === "served" ? await markServed(restaurant, id) : await hostOrderAction(restaurant, id, action);
    if (res.ok && action !== "served") {
      const what = (o.items ?? []).map((l) => `${l.qty ?? 1}× ${l.nameEn ?? ""}`).join(", ").slice(0, 110);
      await logActivity(ctx, action === "accept" ? "order_accepted" : "order_cancelled", what, { total: Number(o.total) });
    }
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
