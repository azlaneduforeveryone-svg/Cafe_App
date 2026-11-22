import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, assertPublicEnv } from "./env";

/**
 * Server-only client with full access (secret / service_role key).
 * Never import this from a "use client" file. The key must never start with NEXT_PUBLIC_.
 */
let admin: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (admin) return admin;
  assertPublicEnv();
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY). See SUPABASE_SETUP.md.");
  admin = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}
