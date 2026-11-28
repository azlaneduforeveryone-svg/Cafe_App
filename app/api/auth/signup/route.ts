import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { fail, json, readBody } from "@/lib/api";
import { siteOrigin } from "@/lib/locale";
import { createRestaurantForUser } from "@/lib/queue";
import { passwordProblem } from "@/lib/password";
import { cleanName } from "@/lib/text";
import { clientIp, overLimit, tooMany } from "@/lib/rateLimit";

export async function POST(req: Request) {
  if (await overLimit({ key: `signup-ip:${await clientIp()}`, windowSec: 3600, max: 5 })) return tooMany(3600);
  const b = await readBody(req);
  const name = cleanName(b.name, 60);
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const restaurantName = cleanName(b.restaurantName, 80);
  // The owner must accept the Terms and Privacy Policy (checkbox on the signup form).
  const accepted = b.acceptTerms === true || b.acceptTerms === "on" || b.acceptTerms === "true";
  const country = b.country === "SA" || b.country === "PK" ? b.country : null;
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !restaurantName || !country) {
    return fail("fields", 400);
  }
  if (passwordProblem(password, email)) return fail("weak_password", 400);
  if (!accepted) return fail("terms", 400);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/dashboard`,
      data: { name },
    },
  });
  if (error) {
    if (error.status === 429) return fail("rate_limited", 429);
    if (/already|registered|exists/i.test(error.message)) return fail("exists", 409);
    if (/password/i.test(error.message)) return fail("fields", 400);
    console.error("[tablepulse] signup failed:", error.message);
    return fail("server_error", 500);
  }
  // With email confirmation on, Supabase hides existing accounts by returning
  // a user with no identities instead of an error.
  const user = data.user;
  if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) return fail("exists", 409);

  const created = await createRestaurantForUser({ userId: user.id, ownerName: name, restaurantName, country, termsAcceptedAt: new Date().toISOString() });
  if (!created.ok) {
    // Don't leave a login without a restaurant behind.
    await supabase.auth.signOut().catch(() => {});
    await adminClient().auth.admin.deleteUser(user.id).catch(() => {});
    return fail(created.error, created.status);
  }

  // No session means Supabase wants the email confirmed first.
  return json({ ok: true, needsConfirm: !data.session });
}
