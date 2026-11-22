import { createClient } from "@/lib/supabase/server";
import { fail, json, readBody } from "@/lib/api";
import { siteOrigin } from "@/lib/locale";

/** Sends a password reset email. Always answers "ok" so it can't be used to test which emails exist. */
export async function POST(req: Request) {
  const { email } = await readBody(req);
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return fail("fields", 400);
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  });
  if (error?.status === 429) return fail("rate_limited", 429);
  if (error) console.error("[tablepulse] reset email failed:", error.message);
  return json({ ok: true });
}
