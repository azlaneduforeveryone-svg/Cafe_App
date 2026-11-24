import { json, withStaff } from "@/lib/api";
import { accessOf, latestSubscription } from "@/lib/billing";

export const dynamic = "force-dynamic";

/** Polled by the billing page right after checkout, until the payment webhook has arrived. */
export async function GET() {
  return withStaff("billing.manage", async ({ restaurant }) => {
    const sub = await latestSubscription(restaurant.id);
    const access = accessOf(restaurant);
    return json({ kind: access.kind, until: access.until, subscription: sub ? sub.status : null });
  });
}
