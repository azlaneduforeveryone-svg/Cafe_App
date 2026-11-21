import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { setSession } from "@/lib/session";
import { fail, json, readBody } from "@/lib/api";

export async function POST(req: Request) {
  const b = await readBody(req);
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const staff = db().staff.find((s) => s.email === email);
  if (!staff || !verifyPassword(password, staff.passwordHash)) return fail("invalid", 401);
  await setSession(staff.id);
  return json({ ok: true });
}
