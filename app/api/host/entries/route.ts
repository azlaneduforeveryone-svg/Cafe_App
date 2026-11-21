import { fail, json, readBody, withStaff } from "@/lib/api";
import { joinQueue } from "@/lib/queue";

/** Host adds a walk-in party from the tablet. */
export async function POST(req: Request) {
  const body = await readBody(req);
  return withStaff(({ restaurant }) => {
    const res = joinQueue(restaurant, body as never, "walkin");
    if (!res.ok) return fail(res.error, res.status);
    return json({ ticketNumber: res.value.ticketNumber, name: res.value.name });
  });
}
