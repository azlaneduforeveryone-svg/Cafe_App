import { cookies } from "next/headers";
import { fail, json, readBody } from "@/lib/api";
import { entryByToken, getRestaurantBySlug, joinQueue } from "@/lib/queue";
import { clientIp, overLimit, tooMany } from "@/lib/rateLimit";

/** One active ticket per phone per restaurant. The cookie holds this phone's ticket token. */
const deviceCookie = (restaurantId: string) => `tp_dt_${restaurantId.replace(/-/g, "").slice(0, 12)}`;

/** Guest joins from the QR page. No login: the returned token is their ticket. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getRestaurantBySlug(slug);
  if (!r) return fail("not_found", 404);

  // Already in line from this phone? Send them back to that ticket instead of making a new one.
  const jar = await cookies();
  const saved = jar.get(deviceCookie(r.id))?.value;
  if (saved) {
    const e = await entryByToken(saved);
    if (e && e.restaurantId === r.id && (e.status === "waiting" || e.status === "notified")) {
      return Response.json({ error: "already_in_line", token: e.token }, { status: 409 });
    }
  }

  // Stop queue flooding. Generous enough for a family sharing restaurant Wi-Fi.
  const ip = await clientIp();
  if (await overLimit({ key: `join-ip:${r.id}:${ip}`, windowSec: 600, max: 8 }, { key: `join-all:${r.id}`, windowSec: 60, max: 40 })) {
    return tooMany(600);
  }

  const res = await joinQueue(r, await readBody(req), "qr");
  if (!res.ok) return fail(res.error, res.status);
  jar.set(deviceCookie(r.id), res.value.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return json({ token: res.value.token });
}
