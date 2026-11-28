import { createClient } from "@/lib/supabase/server";
import { fail, json, readBody } from "@/lib/api";
import { loginEmailFor } from "@/lib/staff";
import { DEVICE_COOKIE } from "@/lib/kitchenDevice";
import { clientIp, overLimit, tooMany } from "@/lib/rateLimit";
import { cookies } from "next/headers";

/** A plain HTML form post (page JavaScript not loaded yet) gets a redirect instead of JSON. */
const isFormPost = (req: Request) => !(req.headers.get("content-type") ?? "").includes("application/json");

export async function POST(req: Request) {
  const form = isFormPost(req);
  const back = (error: string) => Response.redirect(new URL(`/login?error=${error}`, req.url), 303);
  const b = await readBody(req);
  const raw = typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 120) : "";
  const password = typeof b.password === "string" ? b.password : "";

  // Slow down password guessing: per IP and per account. Counted before checking the password.
  const ip = await clientIp();
  if (
    await overLimit(
      { key: `login-ip:${ip}`, windowSec: 600, max: 10 },
      ...(raw ? [{ key: `login-acct:${raw}`, windowSec: 900, max: 5 }] : []),
    )
  ) {
    return form ? back("rate_limited") : tooMany(600);
  }

  // "Email or mobile": staff invited by mobile log in with their number.
  const email = raw ? await loginEmailFor(raw) : null;
  if (!email || !password) return form ? back("invalid") : fail("invalid", 401);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const code =
      error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)
        ? "not_confirmed"
        : error.status === 429
          ? "rate_limited"
          : "invalid";
    if (form) return back(code);
    return fail(code, code === "not_confirmed" ? 403 : code === "rate_limited" ? 429 : 401);
  }
  // A staff login on a kitchen display ends kitchen mode on this browser.
  (await cookies()).delete(DEVICE_COOKIE);
  return form ? Response.redirect(new URL("/dashboard", req.url), 303) : json({ ok: true });
}
