import { createClient } from "@/lib/supabase/server";
import { fail, json, readBody } from "@/lib/api";
import { isDemoEmail } from "@/lib/demo";
import { passwordProblem } from "@/lib/password";
import { clientIp, overLimit, tooMany } from "@/lib/rateLimit";

/** Sets a new password. Works only after opening the reset link (which logs the user in). */
export async function POST(req: Request) {
  if (await overLimit({ key: `reset-ip:${await clientIp()}`, windowSec: 3600, max: 10 })) return tooMany(3600);
  const { password } = await readBody(req);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("no_session", 401);
  if (typeof password !== "string" || passwordProblem(password, user.email)) return fail("weak_password", 400);
  // The shared demo login keeps its password; only the platform owner changes it (seed script).
  if (isDemoEmail(user.email)) return fail("demo_locked", 403);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.status === 429) return fail("rate_limited", 429);
    if (/password/i.test(error.message)) return fail("fields", 400);
    console.error("[tablepulse] password update failed:", error.message);
    return fail("server_error", 500);
  }
  return json({ ok: true });
}
