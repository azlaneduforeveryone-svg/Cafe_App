/**
 * Every Supabase login cookie is HttpOnly (page JavaScript can't read it), Secure in
 * production, and SameSite=Lax. Only our server reads these cookies.
 */
export function hardenCookie<T extends object | undefined>(options: T) {
  return {
    ...(options ?? {}),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}
