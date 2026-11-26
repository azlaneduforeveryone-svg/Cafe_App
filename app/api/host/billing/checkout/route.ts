import { fail, json, withStaff } from "@/lib/api";
import { startCheckout } from "@/lib/billing";
import { siteOrigin } from "@/lib/locale";
import { isDemoRestaurant } from "@/lib/demo";

export const dynamic = "force-dynamic";

/** Starts a Safepay subscription checkout. Returns { url } for the browser to open. */
export async function POST() {
  return withStaff("billing.manage", async (ctx) => {
    if (isDemoRestaurant(ctx.restaurant)) return fail("demo_locked", 403);
    const res = await startCheckout(ctx, await siteOrigin());
    if (!res.ok) return fail(res.error, res.status);
    return json({ url: res.value });
  });
}
