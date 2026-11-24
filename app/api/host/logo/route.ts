import { fail, json, withStaff } from "@/lib/api";
import { setLogo } from "@/lib/menu";

export async function DELETE() {
  return withStaff("settings.manage", async ({ restaurant }) => {
    const res = await setLogo(restaurant, null);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
