// Demo restaurant created by scripts/seed-demo.mjs (optional).
export const DEMO_SLUG = "zaffran-ember";
export const DEMO_EMAIL = "demo@tablepulse.app";
export const DEMO_PASSWORD = "demo1234";

/**
 * Show the demo host login on the landing and login pages only when
 * SHOW_DEMO_LOGIN=1. Anyone with these details can log in as the demo host,
 * so leave it off once real restaurants use the site.
 */
export const showDemoLogin = () => process.env.SHOW_DEMO_LOGIN === "1";

/** Where to go after logging in: only our own dashboard pages (never another site). */
export const safeNext = (next: unknown) =>
  typeof next === "string" && /^\/dashboard(\/[a-z-]{1,20})?$/.test(next) ? next : "/dashboard";
