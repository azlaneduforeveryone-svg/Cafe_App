import { fail, json, readBody, withStaff } from "@/lib/api";
import { deleteItem, setItemStock, updateItem, type StockMode } from "@/lib/menu";

type Ctx = { params: Promise<{ id: string }> };

const MODES: StockMode[] = ["in", "out_today", "out"];

/**
 * Full update, or a stock change alone:
 *   { stock: "in" | "out_today" | "out" }   (out_today comes back by itself at 4 AM)
 *   { available: true | false }            (older screens: same as "in" / "out")
 * A full update never changes stock.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req);
  return withStaff(async ({ restaurant }) => {
    const keys = Object.keys(body);
    let res;
    if (keys.length === 1 && MODES.includes(body.stock as StockMode)) res = await setItemStock(restaurant, id, body.stock as StockMode);
    else if (keys.length === 1 && typeof body.available === "boolean") res = await setItemStock(restaurant, id, body.available ? "in" : "out");
    else res = await updateItem(restaurant, id, body);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withStaff(async ({ restaurant }) => {
    const res = await deleteItem(restaurant, id);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
