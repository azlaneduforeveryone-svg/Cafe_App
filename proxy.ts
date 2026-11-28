import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { hardenCookie } from "@/lib/supabase/cookies";

/**
 * Keeps staff logins fresh. Supabase access tokens expire after about an hour;
 * this refreshes them on each staff request and writes the new cookies back.
 * Guest pages and APIs don't need it (guests never log in).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, hardenCookie(options));
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Do not put code between createServerClient and getUser(): it can cause random logouts.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/pricing", "/login", "/signup", "/reset-password", "/api/host/:path*", "/api/auth/:path*", "/admin/:path*"],
};
