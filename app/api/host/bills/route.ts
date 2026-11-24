import { logActivity } from "@/lib/activity";
import { fail, json, readBody, withStaff } from "@/lib/api";
import { markPaid } from "@/lib/bills";

/** Staff confirm payment: { sessionId } for a table, or { entryId } for a seated ticket, plus optional { method }. */
export async function POST(req: Request) {
  return withStaff("bills.pay", async (ctx) => {
    const body = await readBody(req);
    const res = await markPaid(ctx.restaurant, body);
    if (res.ok) {
      await logActivity(ctx, "bill_paid", `#${res.value.receiptNo ?? ""}`, { method: body.method ?? null, total: res.value.total, table: res.value.table });
      if (res.value.redeemed) await logActivity(ctx, "reward_given", res.value.rewardName ?? "", { receipt: res.value.receiptNo });
    }
    return res.ok ? json({ ok: true, receiptNo: res.value.receiptNo, loyaltyError: res.value.loyaltyError, redeemed: res.value.redeemed }) : fail(res.error, res.status);
  });
}
