import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { adminClient } from "./supabase/admin";

/**
 * Simple server-side rate limits, stored in Postgres (public.rate_limits, migration 0017).
 * Keys are hashed, so no raw IP addresses or emails are kept.
 * If the database call fails we let the request through (and log it): a broken limiter
 * must never lock every restaurant out at dinner time.
 */

const hash = (s: string) => createHash("sha256").update(s).digest("base64url").slice(0, 32);

/** The visitor's IP as Vercel reports it (Vercel sets x-forwarded-for itself). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export type Limit = { key: string; windowSec: number; max: number };

/** Counts one hit on every limit. Returns true if any limit is now exceeded. */
export async function overLimit(...limits: Limit[]): Promise<boolean> {
  const results = await Promise.all(
    limits.map(async (l) => {
      const { data, error } = await adminClient().rpc("tp_rate_limit", {
        p_key: `${l.key.split(":")[0]}:${hash(l.key)}`,
        p_window_seconds: l.windowSec,
        p_max: l.max,
      });
      if (error) {
        console.error("[tablepulse] rate limit check failed:", error.message);
        return true; // allowed
      }
      return data === true;
    }),
  );
  return results.some((ok) => !ok);
}

/** The standard "slow down" answer. */
export function tooMany(retryAfterSec: number) {
  return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
}
