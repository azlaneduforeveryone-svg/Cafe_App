import { fail, json, withStaff } from "@/lib/api";
import { lookupMember } from "@/lib/loyalty";

/** Staff lookup at Mark paid: ?phone=… (typed by staff) or ?sessionId= / ?entryId= (the number the guest gave). */
export async function GET(req: Request) {
  return withStaff("bills.pay", async ({ restaurant }) => {
    const u = new URL(req.url).searchParams;
    const res = await lookupMember(restaurant, { phone: u.get("phone"), sessionId: u.get("sessionId"), entryId: u.get("entryId") });
    return res.ok ? json(res.value) : fail(res.error, res.status);
  });
}
