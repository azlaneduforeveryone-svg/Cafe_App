import { logActivity } from "@/lib/activity";
import { fail, json, readBody, withStaff } from "@/lib/api";
import { createItem } from "@/lib/menu";

export async function POST(req: Request) {
  const body = await readBody(req);
  return withStaff("menu.edit", async (ctx) => {
    const res = await createItem(ctx.restaurant, body);
    if (res.ok) await logActivity(ctx, "dish_added", typeof body.nameEn === "string" ? body.nameEn : "", { price: body.price });
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
