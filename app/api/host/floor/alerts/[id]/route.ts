import { mayUseTable } from "@/lib/access";
import { fail, json, readBody, withStaff } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";
import { resolveAlert } from "@/lib/tables";

/** { action: "ack" | "resolve" } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await readBody(req);
  return withStaff("floor.alerts", async (ctx) => {
    const { restaurant } = ctx;
    const { data: a } = await adminClient().from("service_alerts").select("table_id").eq("id", id).eq("restaurant_id", restaurant.id).maybeSingle();
    if (!a) return fail("not_found", 404);
    if (!(await mayUseTable(ctx, (a as { table_id: string }).table_id))) return fail("not_your_table", 403);
    const res = await resolveAlert(restaurant, id, action === "ack" ? "ack" : "resolve");
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
