import { withStaff } from "@/lib/api";
import { hostSnapshot } from "@/lib/queue";

export const dynamic = "force-dynamic";

/** The host tablet reloads this whenever a live ping arrives. */
export async function GET() {
  return withStaff("queue.view", async ({ restaurant }) =>
    Response.json(await hostSnapshot(restaurant), { headers: { "Cache-Control": "no-store" } }),
  );
}
