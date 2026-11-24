import { fail, json, readBody, withStaff } from "@/lib/api";
import { setPlan } from "@/lib/queue";

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
  return withStaff("billing.manage", async ({ restaurant }) => {
    const res = await setPlan(restaurant, plan);
    if (!res.ok) return fail(res.error, res.status);
    return json({ ok: true });
  });
}
