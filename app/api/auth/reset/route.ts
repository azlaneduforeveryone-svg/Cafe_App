import { createClient } from "@/lib/supabase/server";
import { fail, json, readBody } from "@/lib/api";
import { isDemoEmail } from "@/lib/demo";

/** Sets a new password. Works only after opening the reset link (which logs the user in). */
export async function POST(req: Request) {
  const { password } = await readBody(req);
  if (typeof password !== "string" || password.length < 8) return fail("fields", 400);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("no_session", 401);
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
