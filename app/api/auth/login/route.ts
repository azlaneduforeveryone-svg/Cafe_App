import { createClient } from "@/lib/supabase/server";
import { fail, json, readBody } from "@/lib/api";

export async function POST(req: Request) {
  const b = await readBody(req);
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !password) return fail("invalid", 401);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)) return fail("not_confirmed", 403);
    if (error.status === 429) return fail("rate_limited", 429);
    return fail("invalid", 401);
  }
  return json({ ok: true });
}
