import { fail, json, readBody, withStaff } from "@/lib/api";
import { createTable } from "@/lib/tables";

/** Add a table: { number, capacity, sectionId, staffName } */
export async function POST(req: Request) {
  const body = await readBody(req);
  return withStaff(async ({ restaurant }) => {
    const res = await createTable(restaurant, body);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
