import { fail, json, readBody, withStaff } from "@/lib/api";
import { setMealPeriods } from "@/lib/menu";

/** Replace the meal times: { periods: [{ id, en, ar, ur, start: "12:00", end: "16:00" }] } */
export async function PUT(req: Request) {
  const { periods } = await readBody(req);
  return withStaff("menu.edit", async ({ restaurant }) => {
    const res = await setMealPeriods(restaurant, periods);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
