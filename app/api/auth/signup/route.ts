import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { fail, json, readBody } from "@/lib/api";
import { siteOrigin } from "@/lib/locale";
import { createRestaurantForUser } from "@/lib/queue";

export async function POST(req: Request) {
  const b = await readBody(req);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const restaurantName = typeof b.restaurantName === "string" ? b.restaurantName.trim().slice(0, 80) : "";
  const country = b.country === "SA" || b.country === "PK" ? b.country : null;
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || !restaurantName || !country) {
    return fail("fields", 400);
  }

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

  const created = await createRestaurantForUser({ userId: user.id, ownerName: name, restaurantName, country });
  if (!created.ok) {
    // Don't leave a login without a restaurant behind.
    await supabase.auth.signOut().catch(() => {});
    await adminClient().auth.admin.deleteUser(user.id).catch(() => {});
    return fail(created.error, created.status);
  }

  // No session means Supabase wants the email confirmed first.
  return json({ ok: true, needsConfirm: !data.session });
}
