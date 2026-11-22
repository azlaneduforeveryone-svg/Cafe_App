import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL, assertPublicEnv } from "./env";

/**
 * Supabase client acting as the logged-in staff member (reads the auth cookies).
 * Create a new one per request. Used only for login, logout and "who is this?".
 * All data reads and writes go through the admin client in ./admin.ts.
 */
export async function createClient() {
  // Reading cookies first marks the page as per-request (never prerendered at build time).
  const cookieStore = await cookies();
  assertPublicEnv();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts refreshes the session cookies on the next request instead.
        }
      },
    },
  });
}
