import "server-only";
import crypto from "node:crypto";
import type { StaffContext } from "./auth";
import { PRICING } from "./pricing";
import { broadcastChange } from "./realtime";
import { checkoutUrl, fromMinor, getAuthToken, safepayConfig, stampToDate, subIdOf, verifySignature, type SafepayEvent } from "./safepay";
import { adminClient } from "./supabase/admin";
import type { Country, Restaurant } from "./types";

/**
 * Subscription billing: Safepay card subscriptions for Pakistan, manual payments
 * (bank transfer) recorded by an admin for anyone else. Invoices are issued by the
 * database function tp_record_payment so the number, the invoice and the Pro period
 * are always written together.
 *
 * Environment variables (server only):
 *   BILLING_TAX_RATE    percent included in the price, e.g. 16 (default 0 = no tax line)
 *   BILLING_TAX_LABEL   e.g. "Sales tax on services (PRA)"
 *   SELLER_NAME, SELLER_ADDRESS, SELLER_TAX_ID, SELLER_EMAIL   printed on invoices
 *   SALES_CONTACT       WhatsApp number or email shown to restaurants that can't pay online
 *   ADMIN_EMAILS        comma-separated logins that may open /admin/billing
 */

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string; status: number };
const fail = (error: string, status: number) => ({ ok: false as const, error, status });

export const GRACE_DAYS = 3;
export const PLAN_DESCRIPTION = "Table & Bell Pro, monthly";

export function billingConfig() {
  const rate = Number(process.env.BILLING_TAX_RATE ?? 0);
  return {
    taxRate: Number.isFinite(rate) && rate >= 0 && rate < 100 ? rate : 0,
    taxLabel: process.env.BILLING_TAX_LABEL?.trim() || "Sales tax",
    seller: {
      name: process.env.SELLER_NAME?.trim() || "Table & Bell",
      address: process.env.SELLER_ADDRESS?.trim() || "",
      taxId: process.env.SELLER_TAX_ID?.trim() || "",
      email: process.env.SELLER_EMAIL?.trim() || "",
    },
    salesContact: process.env.SALES_CONTACT?.trim() || "",
    adminEmails: (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}

export const priceOf = (c: Country) => ({ amount: PRICING[c].pro, currency: PRICING[c].currency });

/** Card subscriptions are available only where a gateway is connected (Safepay: Pakistan, PKR). */
export const canPayOnline = (c: Country) => c === "PK" && safepayConfig().ready;

export const isAdminEmail = (email: string) => billingConfig().adminEmails.includes(email.trim().toLowerCase());

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type SubStatus = "pending" | "active" | "past_due" | "paused" | "unpaid" | "cancelled" | "ended" | "abandoned";

export interface Subscription {
  id: string;
  restaurantId: string;
  provider: "safepay" | "manual";
  reference: string;
  providerSubId: string | null;
  customerEmail: string;
  amount: number;
  currency: string;
  status: SubStatus;
  cancelRequestedAt: number | null;
  currentPeriodEnd: number | null;
  createdAt: number;
}

interface SubRow {
  id: string;
  restaurant_id: string;
  provider: "safepay" | "manual";
  reference: string;
  provider_sub_id: string | null;
  provider_plan_id: string | null;
  customer_email: string;
  amount: string | number;
  currency: string;
  status: SubStatus;
  cancel_requested_at: string | null;
  current_period_end: string | null;
  created_at: string;
}

const ms = (t: string | null) => (t ? Date.parse(t) : null);
const toSub = (r: SubRow): Subscription => ({
  id: r.id,
  restaurantId: r.restaurant_id,
  provider: r.provider,
  reference: r.reference,
  providerSubId: r.provider_sub_id,
  customerEmail: r.customer_email,
  amount: Number(r.amount),
  currency: r.currency,
  status: r.status,
  cancelRequestedAt: ms(r.cancel_requested_at),
  currentPeriodEnd: ms(r.current_period_end),
  createdAt: Date.parse(r.created_at),
});

export interface Party {
  name: string;
  address?: string;
  taxId?: string;
  email?: string;
  slug?: string;
  country?: string;
}

export interface Invoice {
  id: string;
  restaurantId: string;
  number: string;
  issuedAt: number;
  periodStart: number;
  periodEnd: number;
  description: string;
  currency: string;
  total: number;
  taxRate: number;
  taxLabel: string;
  netAmount: number;
  taxAmount: number;
  method: string;
  providerTxnId: string | null;
  buyer: Party;
  seller: Party;
  status: "paid" | "void";
  note: string;
}

interface InvoiceRow {
  id: string;
  restaurant_id: string;
  number: string;
  issued_at: string;
  period_start: string;
  period_end: string;
  description: string;
  currency: string;
  total: string | number;
  tax_rate: string | number;
  tax_label: string;
  net_amount: string | number;
  tax_amount: string | number;
  method: string;
  provider_txn_id: string | null;
  buyer: Party;
  seller: Party;
  status: "paid" | "void";
  note: string;
}

const toInvoice = (r: InvoiceRow): Invoice => ({
  id: r.id,
  restaurantId: r.restaurant_id,
  number: r.number,
  issuedAt: Date.parse(r.issued_at),
  periodStart: Date.parse(r.period_start),
  periodEnd: Date.parse(r.period_end),
  description: r.description,
  currency: r.currency,
  total: Number(r.total),
  taxRate: Number(r.tax_rate),
  taxLabel: r.tax_label,
  netAmount: Number(r.net_amount),
  taxAmount: Number(r.tax_amount),
  method: r.method,
  providerTxnId: r.provider_txn_id,
  buyer: r.buyer ?? { name: "" },
  seller: r.seller ?? { name: "" },
  status: r.status,
  note: r.note,
});

// ---------------------------------------------------------------------------
// What the restaurant sees
// ---------------------------------------------------------------------------

export type AccessKind = "paid" | "trial" | "comp" | "free";

export function accessOf(r: Restaurant): { kind: AccessKind; until: number | null } {
  const now = Date.now();
  if (r.proUntil && r.proUntil > now) return { kind: "paid", until: r.proUntil };
  if (r.basePlan === "pro") return { kind: "comp", until: null };
  if (r.trialEndsAt && r.trialEndsAt > now) return { kind: "trial", until: r.trialEndsAt };
  return { kind: "free", until: null };
}

export async function latestSubscription(restaurantId: string): Promise<Subscription | null> {
  const { data } = await adminClient()
    .from("subscriptions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .neq("status", "abandoned")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toSub(data as SubRow) : null;
}

export async function listInvoices(restaurantId: string, limit = 50): Promise<Invoice[]> {
  const { data } = await adminClient()
    .from("invoices")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("issued_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as InvoiceRow[]).map(toInvoice);
}

/** An invoice the given restaurant owns, or any invoice when `restaurantId` is null (admin). */
export async function getInvoice(id: string, restaurantId: string | null): Promise<Invoice | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  let q = adminClient().from("invoices").select("*").eq("id", id);
  if (restaurantId) q = q.eq("restaurant_id", restaurantId);
  const { data } = await q.maybeSingle();
  return data ? toInvoice(data as InvoiceRow) : null;
}

const LIVE: SubStatus[] = ["active", "past_due", "paused"];

// ---------------------------------------------------------------------------
// Checkout and cancellation (owner only)
// ---------------------------------------------------------------------------

export async function startCheckout(ctx: StaffContext, origin: string): Promise<Result<string>> {
  const r = ctx.restaurant;
  if (ctx.staff.role !== "owner") return fail("owner_only", 403);
  if (!canPayOnline(r.country)) return fail("not_available", 400);

  const current = await latestSubscription(r.id);
  // Still live (even with a cancellation requested): never start a second, parallel subscription.
  if (current && LIVE.includes(current.status)) return fail("already_subscribed", 409);

  const db = adminClient();
  // Older unfinished checkouts of this restaurant can't be matched to a payment any more.
  await db.from("subscriptions").update({ status: "abandoned", updated_at: new Date().toISOString() }).eq("restaurant_id", r.id).eq("status", "pending");

  const cfg = safepayConfig();
  const price = priceOf(r.country);
  const reference = `tp_${crypto.randomUUID()}`;
  const { error } = await db.from("subscriptions").insert({
    restaurant_id: r.id,
    provider: "safepay",
    reference,
    provider_plan_id: cfg.planIdPK,
    customer_email: ctx.staff.email.toLowerCase(),
    amount: price.amount,
    currency: price.currency,
  });
  if (error) return fail("server_error", 500);

  try {
    const token = await getAuthToken();
    return {
      ok: true,
      value: checkoutUrl({
        planId: cfg.planIdPK,
        token,
        redirectUrl: `${origin}/dashboard/billing?checkout=return`,
        cancelUrl: `${origin}/dashboard/billing?checkout=cancelled`,
      }),
    };
  } catch {
    return fail("gateway_error", 502);
  }
}

export async function requestCancel(ctx: StaffContext): Promise<Result> {
  if (ctx.staff.role !== "owner") return fail("owner_only", 403);
  const sub = await latestSubscription(ctx.restaurant.id);
  if (!sub || !LIVE.includes(sub.status)) return fail("no_subscription", 400);
  if (sub.cancelRequestedAt) return { ok: true, value: undefined };
  const { error } = await adminClient()
    .from("subscriptions")
    .update({ cancel_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", sub.id);
  if (error) return fail("server_error", 500);
  return { ok: true, value: undefined };
}

export async function undoCancel(ctx: StaffContext): Promise<Result> {
  if (ctx.staff.role !== "owner") return fail("owner_only", 403);
  const sub = await latestSubscription(ctx.restaurant.id);
  if (!sub || !LIVE.includes(sub.status)) return fail("no_subscription", 400);
  await adminClient().from("subscriptions").update({ cancel_requested_at: null, updated_at: new Date().toISOString() }).eq("id", sub.id);
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/** Verifies and stores a webhook. Returns the event id to process, or null for a duplicate. */
export async function receiveSafepay(raw: string, signature: string | null): Promise<Result<string | null>> {
  if (!verifySignature(raw, signature)) return fail("bad_signature", 401);
  let e: SafepayEvent;
  try {
    e = JSON.parse(raw) as SafepayEvent;
  } catch {
    return fail("bad_json", 400);
  }
  const type = typeof e.type === "string" ? e.type : "unknown";
  const token = typeof e.token === "string" && e.token ? e.token : crypto.createHash("sha256").update(raw).digest("hex");
  const id = `safepay:${token}:${type}`;
  const { error } = await adminClient().from("billing_events").insert({ id, provider: "safepay", type, payload: e });
  if (error) {
    if (error.code === "23505") return { ok: true, value: null }; // already received
    return fail("server_error", 500);
  }
  return { ok: true, value: id };
}

const STATUS_BY_TYPE: Record<string, SubStatus | undefined> = {
  "subscription.payment.failed": "past_due",
  "subscription.paused": "paused",
  "subscription.resumed": "active",
  "subscription.unpaid": "unpaid",
  "subscription.canceled": "cancelled",
  "subscription.ended": "ended",
};

async function findSubscription(e: SafepayEvent): Promise<{ sub: SubRow; how: string } | null> {
  const db = adminClient();
  const subId = subIdOf(e);
  if (subId) {
    const { data } = await db.from("subscriptions").select("*").eq("provider_sub_id", subId).maybeSingle();
    if (data) return { sub: data as SubRow, how: "subscription id" };
  }
  const ref = e.data?.reference;
  if (ref) {
    const { data } = await db.from("subscriptions").select("*").eq("reference", ref).maybeSingle();
    if (data) return { sub: data as SubRow, how: "reference" };
  }
  // First event of a new subscription: the pending checkout started by the same email.
  const since = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const email = e.data?.customer_email?.trim().toLowerCase();
  const plan = e.data?.plan_id;
  const { data: pending } = await db
    .from("subscriptions")
    .select("*")
    .eq("provider", "safepay")
    .eq("status", "pending")
    .is("provider_sub_id", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  const candidates = ((pending ?? []) as SubRow[]).filter((s) => !plan || !s.provider_plan_id || s.provider_plan_id === plan);
  if (email) {
    const byEmail = candidates.find((s) => s.customer_email.toLowerCase() === email);
    if (byEmail) return { sub: byEmail, how: "checkout email" };
  }
  // Exactly one open checkout in the last 2 hours: almost certainly this one, but flag it.
  const recent = candidates.filter((s) => Date.parse(s.created_at) > Date.now() - 2 * 3_600_000);
  if (recent.length === 1) return { sub: recent[0], how: "only open checkout (check the email)" };
  return null;
}

type Outcome = { result: "ok" | "ignored" | "unmatched" | "error"; detail: string; subscriptionId?: string; restaurantId?: string };

async function handleSafepay(e: SafepayEvent): Promise<Outcome> {
  const type = e.type ?? "";
  if (!type.startsWith("subscription.")) return { result: "ignored", detail: "not a subscription event" };
  const cfg = safepayConfig();
  if (e.data?.plan_id && cfg.planIdPK && e.data.plan_id !== cfg.planIdPK) {
    return { result: "ignored", detail: `other plan ${e.data.plan_id}` };
  }

  const found = await findSubscription(e);
  if (!found) {
    return { result: "unmatched", detail: `no checkout found for ${e.data?.customer_email ?? "unknown email"} (${subIdOf(e) ?? "no sub id"})` };
  }
  const { sub, how } = found;
  const db = adminClient();
  const subId = subIdOf(e);
  const notes: string[] = [`matched by ${how}`];
  if (subId && !sub.provider_sub_id) {
    await db.from("subscriptions").update({ provider_sub_id: subId, updated_at: new Date().toISOString() }).eq("id", sub.id);
  }

  if (type === "subscription.payment.succeeded") {
    const amount = fromMinor(e.data?.amount) ?? Number(sub.amount);
    const currency = (e.data?.currency ?? sub.currency).toUpperCase();
    if (amount !== Number(sub.amount) || currency !== sub.currency) notes.push(`amount ${currency} ${amount} differs from expected ${sub.currency} ${sub.amount}`);
    const start = stampToDate(e.data?.current_period_start_date) ?? new Date();
    let end = stampToDate(e.data?.current_period_end_date);
    if (!end || end <= start) end = addMonths(start, 1);
    const txn = e.data?.transaction_id || `safepay_${e.token}`;
    const b = billingConfig();
    const { error } = await db.rpc("tp_record_payment", {
      p_subscription_id: sub.id,
      p_txn_id: txn,
      p_total: amount,
      p_currency: currency,
      p_period_start: start.toISOString(),
      p_period_end: end.toISOString(),
      p_method: "card",
      p_description: PLAN_DESCRIPTION,
      p_tax_rate: b.taxRate,
      p_tax_label: b.taxRate ? b.taxLabel : "",
      p_seller: b.seller,
      p_grace_days: GRACE_DAYS,
      p_note: "",
    });
    if (error) return { result: "error", detail: error.message, subscriptionId: sub.id, restaurantId: sub.restaurant_id };
    if (e.data?.customer_email && !sub.customer_email) {
      await db.from("subscriptions").update({ customer_email: e.data.customer_email.toLowerCase() }).eq("id", sub.id);
    }
  } else {
    const next = STATUS_BY_TYPE[type];
    const finished = sub.status === "cancelled" || sub.status === "ended";
    if (next && !(finished && (next === "past_due" || next === "paused" || next === "active"))) {
      await db.from("subscriptions").update({ status: next, updated_at: new Date().toISOString() }).eq("id", sub.id);
    }
    if (!next) notes.push("recorded only");
  }

  await broadcastChange(sub.restaurant_id);
  return { result: "ok", detail: notes.join("; "), subscriptionId: sub.id, restaurantId: sub.restaurant_id };
}

/** Acts on a stored event. Safe to call again: payments are deduplicated by transaction id. */
export async function processEvent(id: string): Promise<Outcome> {
  const db = adminClient();
  const { data } = await db.from("billing_events").select("payload, provider, result").eq("id", id).maybeSingle();
  if (!data) return { result: "error", detail: "event not found" };
  let out: Outcome;
  try {
    out = data.provider === "safepay" ? await handleSafepay(data.payload as SafepayEvent) : { result: "ignored", detail: "unknown provider" };
  } catch (err) {
    out = { result: "error", detail: err instanceof Error ? err.message : "failed" };
  }
  await db
    .from("billing_events")
    .update({
      processed_at: new Date().toISOString(),
      result: out.result,
      detail: out.detail.slice(0, 500),
      subscription_id: out.subscriptionId ?? null,
      restaurant_id: out.restaurantId ?? null,
    })
    .eq("id", id);
  return out;
}

export function addMonths(d: Date, n: number) {
  const x = new Date(d.getTime());
  const day = x.getUTCDate();
  x.setUTCMonth(x.getUTCMonth() + n);
  if (x.getUTCDate() < day) x.setUTCDate(0); // 31 Jan + 1 month = 28/29 Feb
  return x;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminEvent {
  id: string;
  type: string;
  receivedAt: number;
  result: string | null;
  detail: string;
  email: string;
  subId: string | null;
}

export async function adminOverview() {
  const db = adminClient();
  const [events, cancels, invoices, restaurants] = await Promise.all([
    db.from("billing_events").select("id, type, payload, received_at, result, detail").order("received_at", { ascending: false }).limit(40),
    db.from("subscriptions").select("*, restaurants(name, slug)").not("cancel_requested_at", "is", null).in("status", LIVE).order("cancel_requested_at"),
    db.from("invoices").select("*").order("issued_at", { ascending: false }).limit(30),
    db.from("restaurants").select("id, name, slug, country, plan, pro_until, trial_ends_at, created_at").order("created_at", { ascending: false }).limit(300),
  ]);
  return {
    events: ((events.data ?? []) as { id: string; type: string; payload: SafepayEvent; received_at: string; result: string | null; detail: string }[]).map(
      (e): AdminEvent => ({
        id: e.id,
        type: e.type,
        receivedAt: Date.parse(e.received_at),
        result: e.result,
        detail: e.detail,
        email: e.payload?.data?.customer_email ?? "",
        subId: subIdOf(e.payload ?? {}),
      }),
    ),
    cancels: ((cancels.data ?? []) as (SubRow & { restaurants: { name: string; slug: string } | null })[]).map((s) => ({
      ...toSub(s),
      restaurantName: s.restaurants?.name ?? "",
      restaurantSlug: s.restaurants?.slug ?? "",
    })),
    invoices: ((invoices.data ?? []) as InvoiceRow[]).map(toInvoice),
    restaurants: ((restaurants.data ?? []) as { id: string; name: string; slug: string; country: Country; plan: string; pro_until: string | null; trial_ends_at: string | null; created_at: string }[]).map(
      (r) => {
        const now = Date.now();
        const paid = !!r.pro_until && Date.parse(r.pro_until) > now;
        const trial = !!r.trial_ends_at && Date.parse(r.trial_ends_at) > now;
        return { ...r, paid, access: paid ? "Paid" : r.plan === "pro" ? "Pro (set by hand)" : trial ? "Trial" : "Free" };
      },
    ),
  };
}

/** Bank transfer or other offline payment: issues the invoice and extends Pro from today or from the current end. */
export async function recordManualPayment(o: { slug: string; months: number; amount: number; currency: string; method: string; note: string }): Promise<Result<Invoice>> {
  const db = adminClient();
  const months = Math.round(o.months);
  if (!(months >= 1 && months <= 24) || !(o.amount >= 0) || !/^[A-Z]{3}$/.test(o.currency)) return fail("invalid", 400);
  const { data: r } = await db.from("restaurants").select("id, pro_until").eq("slug", o.slug.trim().toLowerCase()).maybeSingle();
  if (!r) return fail("restaurant_not_found", 404);

  const now = new Date();
  const currentEnd = r.pro_until ? new Date(r.pro_until as string) : null;
  // Paid time already includes grace days; continue from the real period end.
  const start = currentEnd && currentEnd.getTime() - GRACE_DAYS * 86_400_000 > now.getTime() ? new Date(currentEnd.getTime() - GRACE_DAYS * 86_400_000) : now;
  const end = addMonths(start, months);
  const ref = `manual_${crypto.randomUUID()}`;
  const { data: sub, error } = await db
    .from("subscriptions")
    .insert({ restaurant_id: r.id, provider: "manual", reference: ref, amount: o.amount, currency: o.currency })
    .select("id")
    .single();
  if (error || !sub) return fail("server_error", 500);
  const b = billingConfig();
  const { data: inv, error: invErr } = await db
    .rpc("tp_record_payment", {
      p_subscription_id: sub.id,
      p_txn_id: ref,
      p_total: o.amount,
      p_currency: o.currency,
      p_period_start: start.toISOString(),
      p_period_end: end.toISOString(),
      p_method: o.method || "bank_transfer",
      p_description: months === 1 ? PLAN_DESCRIPTION : `Table & Bell Pro, ${months} months`,
      p_tax_rate: b.taxRate,
      p_tax_label: b.taxRate ? b.taxLabel : "",
      p_seller: b.seller,
      p_grace_days: GRACE_DAYS,
      p_note: o.note.slice(0, 300),
    })
    .single();
  if (invErr || !inv) return fail(invErr?.message ?? "server_error", 500);
  // A manual payment doesn't renew by itself.
  await db.from("subscriptions").update({ status: "ended" }).eq("id", sub.id);
  await broadcastChange(r.id as string);
  return { ok: true, value: toInvoice(inv as InvoiceRow) };
}

/** Attach an unmatched Safepay event to a restaurant, then re-run it and any later events of the same subscription. */
export async function linkEvent(eventId: string, slug: string): Promise<Result<Outcome>> {
  const db = adminClient();
  const { data: ev } = await db.from("billing_events").select("payload").eq("id", eventId).maybeSingle();
  if (!ev) return fail("event_not_found", 404);
  const e = ev.payload as SafepayEvent;
  const subId = subIdOf(e);
  if (!subId) return fail("event_has_no_subscription_id", 400);
  const { data: r } = await db.from("restaurants").select("id, country").eq("slug", slug.trim().toLowerCase()).maybeSingle();
  if (!r) return fail("restaurant_not_found", 404);

  const { data: existing } = await db.from("subscriptions").select("id, restaurant_id").eq("provider_sub_id", subId).maybeSingle();
  if (existing && existing.restaurant_id !== r.id) return fail("subscription_belongs_to_another_restaurant", 409);
  if (!existing) {
    const price = priceOf(r.country as Country);
    const { error } = await db.from("subscriptions").insert({
      restaurant_id: r.id,
      provider: "safepay",
      reference: `tp_${crypto.randomUUID()}`,
      provider_sub_id: subId,
      provider_plan_id: e.data?.plan_id ?? null,
      customer_email: (e.data?.customer_email ?? "").toLowerCase(),
      amount: price.amount,
      currency: price.currency,
    });
    if (error) return fail("server_error", 500);
  }
  // Re-run every stored event of this subscription in the order received.
  const { data: all } = await db.from("billing_events").select("id, payload").eq("provider", "safepay").order("received_at");
  let last: Outcome = { result: "ignored", detail: "" };
  for (const row of (all ?? []) as { id: string; payload: SafepayEvent }[]) {
    if (subIdOf(row.payload) === subId) last = await processEvent(row.id);
  }
  return { ok: true, value: last };
}

export async function markCancelled(subscriptionId: string): Promise<Result> {
  const { data, error } = await adminClient()
    .from("subscriptions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", subscriptionId)
    .select("restaurant_id")
    .maybeSingle();
  if (error || !data) return fail("not_found", 404);
  await broadcastChange(data.restaurant_id as string);
  return { ok: true, value: undefined };
}
