import { fail, json, readBody, withStaff } from "@/lib/api";
import { setStations } from "@/lib/menu";

/** Replace kitchen stations: { stations: [{ id, en, ar, ur }] } */
export async function PUT(req: Request) {
  const { stations } = await readBody(req);
  return withStaff("menu.edit", async ({ restaurant }) => {
    const res = await setStations(restaurant, stations);
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
