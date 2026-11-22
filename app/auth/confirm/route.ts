import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

/** Only same-site paths, so the link can't bounce people to another website. */
function safeNext(v: string | null) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

/**
 * Where Supabase email links land (confirm signup, reset password).
 * Handles both link styles:
 *   ?token_hash=...&type=...  (recommended email template, works on any device)
 *   ?code=...                 (Supabase default template, same browser only)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const supabase = await createClient();

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(type === "recovery" ? "/reset-password" : next);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }
  redirect("/login?error=link");
}
