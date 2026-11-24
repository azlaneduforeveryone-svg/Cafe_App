import { json, readBody, withStaff } from "@/lib/api";
import { markRead } from "@/lib/notify";

/** { ids: number[] } or { all: true }: mark kitchen notifications as seen. */
export async function POST(req: Request) {
  return withStaff(["floor.view", "queue.view"], async ({ staff }) => {
    const b = await readBody(req);
    await markRead(staff.userId, b.all === true ? undefined : b.ids);
    return json({ ok: true });
  });
}
