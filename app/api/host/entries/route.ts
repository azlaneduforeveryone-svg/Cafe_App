import { fail, json, readBody, withStaff } from "@/lib/api";
import { joinQueue } from "@/lib/queue";

/** Host adds a walk-in party from the tablet. */
export async function POST(req: Request) {
  const body = await readBody(req);
  return withStaff("queue.manage", async ({ restaurant }) => {
    const res = await joinQueue(restaurant, body, "walkin");
    if (!res.ok) return fail(res.error, res.status);
    return json({ ticketNumber: res.value.ticketNumber, name: res.value.name });
  });
}
