import { createClient as plainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { fail, json, readBody } from "@/lib/api";
import { isDemoEmail } from "@/lib/demo";
import { passwordProblem } from "@/lib/password";
import { overLimit, tooMany } from "@/lib/rateLimit";

/**
 * Logged-in staff change their own password: { current, password }.
 * The current password is checked first, then every other device is signed out.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return fail("unauthorized", 401);
  if (isDemoEmail(user.email)) return fail("demo_locked", 403);
  if (await overLimit({ key: `pwchange:${user.id}`, windowSec: 900, max: 5 })) return tooMany(900);

  const b = await readBody(req);
  const current = typeof b.current === "string" ? b.current : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!current) return fail("wrong_password", 400);
  if (passwordProblem(password, user.email)) return fail("weak_password", 400);

  // Check the current password on a throwaway client, so this browser's session isn't touched.
  const check = plainClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await check.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) return fail(wrong.status === 429 ? "rate_limited" : "wrong_password", wrong.status === 429 ? 429 : 400);
  await check.auth.signOut({ scope: "local" }).catch(() => {});

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/password/i.test(error.message)) return fail("weak_password", 400);
    console.error("[tablepulse] password change failed:", error.message);
    return fail("server_error", 500);
  }
  await supabase.auth.signOut({ scope: "others" }).catch(() => {});
  return json({ ok: true });
}
