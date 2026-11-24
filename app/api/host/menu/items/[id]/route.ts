import { logActivity } from "@/lib/activity";
import { fail, json, readBody, withStaff } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";
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
  const keys = Object.keys(body);
  const stockOnly = keys.length === 1 && (MODES.includes(body.stock as StockMode) || typeof body.available === "boolean");
  // Sold out / back in stock is a kitchen job; changing a dish or its price is a manager's.
  return withStaff(stockOnly ? "menu.stock" : "menu.edit", async (ctx) => {
    const { restaurant } = ctx;
    const { data: before } = await adminClient().from("menu_items").select("name_en, price").eq("id", id).eq("restaurant_id", restaurant.id).maybeSingle();
    const prev = before as { name_en: string; price: number | string } | null;
    let res;
    if (keys.length === 1 && MODES.includes(body.stock as StockMode)) res = await setItemStock(restaurant, id, body.stock as StockMode);
    else if (keys.length === 1 && typeof body.available === "boolean") res = await setItemStock(restaurant, id, body.available ? "in" : "out");
    else res = await updateItem(restaurant, id, body);
    if (res.ok && prev) {
      if (stockOnly) await logActivity(ctx, "stock_changed", prev.name_en, { stock: body.stock ?? (body.available ? "in" : "out") });
      else {
        const { data: after } = await adminClient().from("menu_items").select("price").eq("id", id).maybeSingle();
        const newPrice = Number((after as { price: number | string } | null)?.price ?? prev.price);
        if (newPrice !== Number(prev.price)) await logActivity(ctx, "price_changed", prev.name_en, { from: Number(prev.price), to: newPrice });
        else await logActivity(ctx, "dish_changed", prev.name_en);
      }
    }
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return withStaff("menu.edit", async (ctx) => {
    const { restaurant } = ctx;
    const { data: before } = await adminClient().from("menu_items").select("name_en").eq("id", id).eq("restaurant_id", restaurant.id).maybeSingle();
    const res = await deleteItem(restaurant, id);
    if (res.ok && before) await logActivity(ctx, "dish_deleted", (before as { name_en: string }).name_en);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
