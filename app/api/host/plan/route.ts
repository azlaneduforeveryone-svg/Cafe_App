import { persist } from "@/lib/db";
import { emitChange } from "@/lib/events";
import { fail, json, readBody, withStaff } from "@/lib/api";

/**
 * Test-mode plan switch. Disabled in production unless ALLOW_TEST_UPGRADE=1.
 * Replace with the payment gateway's webhook when billing is connected.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_UPGRADE !== "1") {
    return fail("gateway_not_connected", 501);
  }
  const { plan } = await readBody(req);
  if (plan !== "free" && plan !== "pro") return fail("bad_plan", 400);
  return withStaff(({ restaurant }) => {
    restaurant.plan = plan;
    persist();
    emitChange(restaurant.id);
    return json({ ok: true });
  });
}
