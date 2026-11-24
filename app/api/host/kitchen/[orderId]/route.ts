import { fail, json, readBody, withStaff } from "@/lib/api";
import { stationReady } from "@/lib/menu";

/** A station marks its part of an order ready: { station: "tandoor" } ("" = general kitchen). */
export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const { station } = await readBody(req);
  return withStaff("kitchen.act", async ({ restaurant }) => {
    const res = await stationReady(restaurant, orderId, station ?? "");
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
