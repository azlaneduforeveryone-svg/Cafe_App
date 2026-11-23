import "server-only";
import crypto from "node:crypto";

/**
 * Safepay (Pakistan) subscriptions.
 * Docs: https://safepay-docs.netlify.app/developers/subscriptions/introduction
 *
 * Flow: create a plan once in the Safepay dashboard -> for each checkout get a short-lived
 * auth token -> redirect the owner to Safepay's hosted page -> Safepay charges monthly and
 * tells us through signed webhooks. Access is granted only from webhooks, never from the
 * redirect back.
 *
 * Environment variables (server only, never NEXT_PUBLIC_):
 *   SAFEPAY_ENV             sandbox | production          (default sandbox)
 *   SAFEPAY_SECRET_KEY      merchant secret key
 *   SAFEPAY_WEBHOOK_SECRET  endpoint shared secret (differs between sandbox and live)
 *   SAFEPAY_PLAN_ID_PK      plan_... for Pro monthly in PKR
 */

export type SafepayEnv = "sandbox" | "production";

export function safepayConfig() {
  const env: SafepayEnv = process.env.SAFEPAY_ENV === "production" ? "production" : "sandbox";
  const secretKey = process.env.SAFEPAY_SECRET_KEY ?? "";
  const webhookSecret = process.env.SAFEPAY_WEBHOOK_SECRET ?? "";
  const planIdPK = process.env.SAFEPAY_PLAN_ID_PK ?? "";
  return {
    env,
    apiHost: env === "production" ? "https://api.getsafepay.com" : "https://sandbox.api.getsafepay.com",
    checkoutHost: env === "production" ? "https://getsafepay.com" : "https://sandbox.api.getsafepay.com",
    secretKey,
    webhookSecret,
    planIdPK,
    /** Checkout can start only when all three are set. */
    ready: Boolean(secretKey && webhookSecret && planIdPK),
  };
}

// One token per server instance, refreshed 5 minutes before its ~1 hour expiry.
let cached: { token: string; expiresAt: number } | null = null;

export async function getAuthToken(): Promise<string> {
  const cfg = safepayConfig();
  if (cached && cached.expiresAt - 5 * 60_000 > Date.now()) return cached.token;
  const res = await fetch(`${cfg.apiHost}/client/passport/v1/token`, {
    method: "POST",
    headers: { "X-SFPY-MERCHANT-SECRET": cfg.secretKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`safepay_token_${res.status}`);
  const body = (await res.json().catch(() => null)) as { data?: unknown } | null;
  const token = typeof body?.data === "string" ? body.data : "";
  if (!token) throw new Error("safepay_token_empty");
  cached = { token, expiresAt: Date.now() + 60 * 60_000 };
  return token;
}

export function checkoutUrl(o: { planId: string; token: string; redirectUrl: string; cancelUrl: string }) {
  const cfg = safepayConfig();
  const params = new URLSearchParams({
    plan_id: o.planId,
    auth_token: o.token,
    env: cfg.env,
    redirect_url: o.redirectUrl,
    cancel_url: o.cancelUrl,
  });
  return `${cfg.checkoutHost}/checkout/auth/login?${params.toString()}`;
}

/** X-SFPY-SIGNATURE = hex HMAC-SHA512 of the raw request body, keyed with the webhook secret. */
export function verifySignature(rawBody: string, signature: string | null, secret = safepayConfig().webhookSecret): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Webhook payload (fields per Safepay's "Webhook structure and types" page)
// ---------------------------------------------------------------------------

type Stamp = { seconds?: number | string; nanos?: number } | null | undefined;

export interface SafepayEvent {
  token?: string;
  type?: string;
  merchant_api_key?: string;
  data?: {
    id?: string; // sub_...
    subscription_id?: string; // some docs use this name
    reference?: string; // documented in prose, not in examples
    plan_id?: string;
    customer_email?: string;
    status?: string;
    amount?: number | string; // lowest unit (paisa for PKR)
    currency?: string;
    current_period_start_date?: Stamp;
    current_period_end_date?: Stamp;
    transaction_id?: string;
    transaction_status?: string;
    transaction_error_message?: string;
  };
}

export const stampToDate = (s: Stamp): Date | null => {
  const sec = Number(s?.seconds);
  return Number.isFinite(sec) && sec > 0 ? new Date(sec * 1000) : null;
};

/** Safepay amounts are in the lowest unit (paisa for PKR, cents for USD). */
export const fromMinor = (amount: number | string | undefined) => {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n) / 100 : null;
};

export const subIdOf = (e: SafepayEvent) => e.data?.id ?? e.data?.subscription_id ?? null;
