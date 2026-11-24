import { fail, json, readBody } from "@/lib/api";
import { acceptInvite } from "@/lib/staff";

/** { token, password }: accept a staff invite (public; the token is the proof). */
export async function POST(req: Request) {
  const b = await readBody(req);
  const res = await acceptInvite(typeof b.token === "string" ? b.token : "", b.password);
  return res.ok ? json({ ok: true, home: res.value.home }) : fail(res.error, res.status);
}
