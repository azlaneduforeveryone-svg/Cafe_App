import { fail, json, readBody, withStaff } from "@/lib/api";
import { updateSettings } from "@/lib/queue";

export async function PUT(req: Request) {
  const body = await readBody(req);
  return withStaff(async ({ restaurant }) => {
    const res = await updateSettings(restaurant, body);
    if (!res.ok) return fail(res.error, res.status);
    return json({ ok: true });
  });
}
