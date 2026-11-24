import { fail, json, readBody, withStaff } from "@/lib/api";
import { saveLoyaltySettings } from "@/lib/loyalty";

export async function PUT(req: Request) {
  return withStaff(async ({ staff, restaurant }) => {
    if (staff.role !== "owner") return fail("owner_only", 403);
    const res = await saveLoyaltySettings(restaurant, await readBody(req));
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
