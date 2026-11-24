import { createClient } from "@/lib/supabase/server";
import { fail, json, readBody } from "@/lib/api";
import { siteOrigin } from "@/lib/locale";
import { PHONE_DOMAIN } from "@/lib/staff";

/** Sends a password reset email. Always answers "ok" so it can't be used to test which emails exist. */
export async function POST(req: Request) {
  const { email } = await readBody(req);
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return fail("fields", 400);
  // Mobile logins have no mailbox: the manager sends them a new invite link instead.
  if (email.trim().toLowerCase().endsWith(`@${PHONE_DOMAIN}`)) return json({ ok: true });
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  });
  if (error?.status === 429) return fail("rate_limited", 429);
  if (error) console.error("[tablepulse] reset email failed:", error.message);
  return json({ ok: true });
}
