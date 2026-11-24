import { fail, json, readBody, withStaff } from "@/lib/api";
import { setWifi } from "@/lib/tables";

/** { ssid, password } shown to guests who scanned a table QR. */
export async function PUT(req: Request) {
  const body = await readBody(req);
  return withStaff("tables.manage", async ({ restaurant }) => {
    const res = await setWifi(restaurant, body);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
