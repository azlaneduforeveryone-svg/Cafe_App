import { fail, json, readBody } from "@/lib/api";
import { deviceSnapshot, getDevice, logDevice } from "@/lib/kitchenDevice";
import { setItemStock, stationReady } from "@/lib/menu";
import { adminClient } from "@/lib/supabase/admin";

export async function GET() {
  const d = await getDevice();
  if (!d) return fail("unauthorized", 401);
  return json(await deviceSnapshot(d));
}

/** { action: "ready", orderId, station } | { action: "out", itemId }. Nothing else. */
export async function POST(req: Request) {
  const d = await getDevice();
  if (!d) return fail("unauthorized", 401);
  const b = await readBody(req);
  if (b.action === "ready") {
    const res = await stationReady(d.restaurant, String(b.orderId ?? ""), b.station);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  }
  if (b.action === "out") {
    const id = String(b.itemId ?? "");
    const res = await setItemStock(d.restaurant, id, "out_today");
    if (res.ok) {
      const { data } = await adminClient().from("menu_items").select("name_en").eq("id", id).maybeSingle();
      await logDevice(d.restaurant.id, d.device, "stock_changed", (data as { name_en: string } | null)?.name_en ?? "", { stock: "out_today" });
    }
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  }
  return fail("bad_action", 400);
}
