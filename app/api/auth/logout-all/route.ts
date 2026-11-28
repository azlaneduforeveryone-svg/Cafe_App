import { createClient } from "@/lib/supabase/server";
import { fail, json } from "@/lib/api";
import { isDemoEmail } from "@/lib/demo";

/** Signs this account out on every device (lost tablet, someone left with the password). */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthorized", 401);
  // The shared demo login stays usable for everyone else.
  if (isDemoEmail(user.email)) return fail("demo_locked", 403);
  await supabase.auth.signOut({ scope: "global" });
  return json({ ok: true });
}
