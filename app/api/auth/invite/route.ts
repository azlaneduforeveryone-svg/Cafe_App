import { fail, json, readBody } from "@/lib/api";
import { acceptInvite } from "@/lib/staff";
import { clientIp, overLimit, tooMany } from "@/lib/rateLimit";

/** { token, password }: accept a staff invite (public; the token is the proof). */
export async function POST(req: Request) {
  if (await overLimit({ key: `invite-ip:${await clientIp()}`, windowSec: 3600, max: 15 })) return tooMany(3600);
  const b = await readBody(req);
  const res = await acceptInvite(typeof b.token === "string" ? b.token : "", b.password);
  return res.ok ? json({ ok: true, home: res.value.home }) : fail(res.error, res.status);
}
