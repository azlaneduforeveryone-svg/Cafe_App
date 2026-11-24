import { fail, json, readBody, withStaff } from "@/lib/api";
import { createCategory } from "@/lib/menu";

export async function POST(req: Request) {
  const body = await readBody(req);
  return withStaff("menu.edit", async ({ restaurant }) => {
    const res = await createCategory(restaurant, body);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
