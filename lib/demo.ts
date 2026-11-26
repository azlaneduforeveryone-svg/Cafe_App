// Demo restaurant created by scripts/seed-demo.mjs (optional).
export const DEMO_SLUG = "zaffran-ember";
export const DEMO_EMAIL = "demo@tableandbell.com";
/** Earlier demo login, kept so its account can still be recognised and locked. */
const OLD_DEMO_EMAIL = "demo@tablepulse.app";

// The demo password is never in the code. It lives only in DEMO_PASSWORD (.env.local) for
// the seed script, and the owner shares it privately with people who ask for a demo.

/**
 * Show the demo staff links (Table 5, Floor, Kitchen) on the demo guest page only when
 * SHOW_DEMO_LOGIN=1. Leave it off once real restaurants use the site.
 */
export const showDemoLogin = () => process.env.SHOW_DEMO_LOGIN === "1";

export const isDemoEmail = (email: string | null | undefined) => {
  const e = (email ?? "").trim().toLowerCase();
  return e === DEMO_EMAIL || e === OLD_DEMO_EMAIL;
};

/**
 * The demo login is shared with many prospects, so nothing that could lock others out,
 * add people, charge money, change legal details or upload files works there.
 */
export const isDemoRestaurant = (r: { slug: string }) => r.slug === DEMO_SLUG;

/** Where to go after logging in: only our own dashboard pages (never another site). */
export const safeNext = (next: unknown) =>
  typeof next === "string" && /^\/dashboard(\/[a-z-]{1,20})?$/.test(next) ? next : "/dashboard";
