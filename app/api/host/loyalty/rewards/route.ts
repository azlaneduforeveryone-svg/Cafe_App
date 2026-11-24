import { fail, json, readBody, withStaff } from "@/lib/api";
import { deleteReward, listRewards, saveReward } from "@/lib/loyalty";

export async function GET() {
  return withStaff("loyalty.manage", async ({ restaurant }) => json({ rewards: await listRewards(restaurant.id) }));
}

/** Create or update ({ id }) a reward. */
export async function POST(req: Request) {
  return withStaff("loyalty.manage", async ({ restaurant }) => {
    const res = await saveReward(restaurant, await readBody(req));
    return res.ok ? json({ ok: true, id: res.value.id }) : fail(res.error, res.status);
  });
}

export async function DELETE(req: Request) {
  return withStaff("loyalty.manage", async ({ restaurant }) => {
    const res = await deleteReward(restaurant, new URL(req.url).searchParams.get("id") ?? "");
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
