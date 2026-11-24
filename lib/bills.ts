import "server-only";
import { adminClient } from "./supabase/admin";
import { broadcastChange } from "./realtime";
import { tableIsOpen } from "./menu";
import { earnForBill, maskPhone, memberIdByPhone, normalisePhone, receiptLoyalty, redeemReward } from "./loyalty";
import { PAY_METHODS, type Bill, type BillLine, type BillSummary, type Entry, type LoyaltyReceipt, type PayMethod, type Restaurant } from "./types";

/**
 * The bill: split, tip, how the guest will pay, staff confirming payment, receipt and rating.
 *
 * Every amount is worked out in the database from orders the restaurant approved; the phone only
 * chooses tip %, split and method. TablePulse records payment, it does not take it, so the
 * receipt is marked "not a tax invoice".
 */

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string; status: number };
const fail = (error: string, status: number) => ({ ok: false as const, error, status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL_METHODS = new Set<string>(Object.values(PAY_METHODS).flat());
/** Guests can still see the receipt and leave a rating this long after paying, even once the table is closed. */
export const RECEIPT_HOURS = 6;

/** Where a bill's orders come from: a table session, or a seated waitlist ticket without a table. */
export interface BillSource {
  restaurantId: string;
  sessionId: string | null;
  entryId: string | null;
  /** Guest may still ask for / change the bill (table open). Seeing a paid receipt doesn't need it. */
  canRequest: boolean;
}

interface BillRow {
  id: string;
  restaurant_id: string;
  session_id: string | null;
  entry_id: string | null;
  status: "requested" | "paid";
  subtotal: string | number;
  tip_pct: number;
  tip_amount: string | number;
  total: string | number;
  split_ways: number;
  method: PayMethod;
  receipt_no: number | null;
  lines: BillLine[];
  requested_at: string | null;
  paid_at: string | null;
  loyalty_phone?: string | null;
}

const money = (n: number) => Math.round(n * 100) / 100;
const perPerson = (total: number, ways: number) => money(Math.ceil((total / Math.max(1, ways)) * 100) / 100);
const ts = (s: string | null) => (s ? Date.parse(s) : null);

const toLines = (raw: unknown): BillLine[] =>
  (Array.isArray(raw) ? raw : []).map((l: Record<string, unknown>) => ({
    id: String(l.id ?? ""),
    nameEn: String(l.nameEn ?? ""),
    nameAr: String(l.nameAr ?? ""),
    nameUr: String(l.nameUr ?? ""),
    price: Number(l.price ?? 0),
    qty: Number(l.qty ?? 0),
    portion: (l.portion as BillLine["portion"]) ?? null,
    spice: (l.spice as BillLine["spice"]) ?? null,
  }));

function toBill(b: BillRow, rating: { stars: number; comment: string } | null, loyalty: LoyaltyReceipt | null = null): Bill {
  const total = Number(b.total);
  return {
    id: b.id,
    status: b.status,
    subtotal: Number(b.subtotal),
    tipPct: b.tip_pct,
    tipAmount: Number(b.tip_amount),
    total,
    splitWays: b.split_ways,
    perPerson: perPerson(total, b.split_ways),
    method: b.method,
    receiptNo: b.receipt_no,
    lines: toLines(b.lines),
    requestedAt: ts(b.requested_at),
    paidAt: ts(b.paid_at),
    rating,
    loyaltyPhone: maskPhone(b.loyalty_phone),
    loyalty,
  };
}

export const toSummary = (b: Bill | BillRow, stars: number | null = null): BillSummary => {
  if ("splitWays" in b) {
    return { status: b.status === "paid" ? "paid" : "requested", subtotal: b.subtotal, tipAmount: b.tipAmount, total: b.total, splitWays: b.splitWays, perPerson: b.perPerson, method: b.method, receiptNo: b.receiptNo, stars: b.rating?.stars ?? stars, loyaltyPhone: b.loyaltyPhone };
  }
  const total = Number(b.total);
  return { status: b.status, subtotal: Number(b.subtotal), tipAmount: Number(b.tip_amount), total, splitWays: b.split_ways, perPerson: perPerson(total, b.split_ways), method: b.method, receiptNo: b.receipt_no, stars, loyaltyPhone: maskPhone(b.loyalty_phone) };
};

async function findBill(src: BillSource): Promise<BillRow | null> {
  const db = adminClient();
  const q = src.sessionId
    ? db.from("bills").select("*").eq("session_id", src.sessionId)
    : db.from("bills").select("*").eq("entry_id", src.entryId ?? "").order("created_at", { ascending: false }).limit(1);
  const { data } = await q.maybeSingle();
  return (data as BillRow | null) ?? null;
}

/** The current bill (or a preview of it), or null when nothing has been approved yet. */
export async function billFor(src: BillSource): Promise<Bill | null> {
  if (!src.sessionId && !src.entryId) return null;
  const row = await findBill(src);
  if (row) {
    if (row.status === "paid") {
      const [{ data }, loyalty] = await Promise.all([
        adminClient().from("ratings").select("stars, comment").eq("bill_id", row.id).maybeSingle(),
        receiptLoyalty(row.restaurant_id, row.id),
      ]);
      return toBill(row, (data as { stars: number; comment: string } | null) ?? null, loyalty);
    }
    // Requested: the guest may have had another round approved since; keep the figures current.
    const live = await linesFor(src);
    const tipAmount = money((live.subtotal * row.tip_pct) / 100);
    return toBill({ ...row, lines: live.lines, subtotal: live.subtotal, tip_amount: tipAmount, total: money(live.subtotal + tipAmount) }, null);
  }
  if (!src.canRequest) return null;
  const live = await linesFor(src);
  if (live.subtotal <= 0) return null;
  return {
    id: null,
    status: "open",
    subtotal: live.subtotal,
    tipPct: 0,
    tipAmount: 0,
    total: live.subtotal,
    splitWays: 1,
    perPerson: live.subtotal,
    method: "cash",
    receiptNo: null,
    lines: live.lines,
    requestedAt: null,
    paidAt: null,
    rating: null,
    loyaltyPhone: null,
    loyalty: null,
  };
}

async function linesFor(src: BillSource): Promise<{ lines: BillLine[]; subtotal: number }> {
  const { data } = await adminClient().rpc("tp_bill_lines", { p_session_id: src.sessionId, p_entry_id: src.sessionId ? null : src.entryId }).single();
  const d = data as { lines: unknown; subtotal: string | number } | null;
  return { lines: toLines(d?.lines), subtotal: Number(d?.subtotal ?? 0) };
}

const intIn = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

/** Guest asks for the bill, or changes tip / split / method before paying. */
export async function requestBill(src: BillSource, r: Restaurant, b: Record<string, unknown>): Promise<Result> {
  if (!src.canRequest) return fail("table_closed", 409);
  const method = typeof b.method === "string" ? b.method : "";
  if (!PAY_METHODS[r.country].includes(method as PayMethod)) return fail("bad_method", 400);
  // Optional loyalty number. Only stored on the bill; nothing is earned until staff mark it paid.
  const rawPhone = typeof b.phone === "string" ? b.phone.trim() : "";
  let phone: string | null | undefined;
  if (r.loyalty.mode !== "off" && rawPhone) {
    phone = await normalisePhone(r, rawPhone);
    if (!phone) return fail("bad_phone", 400);
  } else if (b.phone === "") phone = null;
  const { data: billRow, error } = await adminClient()
    .rpc("tp_request_bill", {
      p_session_id: src.sessionId,
      p_entry_id: src.sessionId ? null : src.entryId,
      p_tip_pct: intIn(b.tipPct, 0, 30, 0),
      p_split: intIn(b.split, 1, 20, 1),
      p_method: method,
    })
    .single();
  if (error) {
    for (const code of ["bill_paid", "empty_bill", "bad_method"]) if (error.message.includes(code)) return fail(code, 409);
    if (error.message.includes("not_found")) return fail("table_closed", 409);
    return fail("server_error", 500);
  }
  if (phone !== undefined && billRow) await adminClient().from("bills").update({ loyalty_phone: phone }).eq("id", (billRow as BillRow).id).eq("status", "requested");
  await broadcastChange(src.restaurantId);
  return { ok: true, value: undefined };
}

/** Guest rates the visit: only after paying, once per bill. */
export async function rateBill(src: BillSource, b: Record<string, unknown>): Promise<Result> {
  const row = await findBill(src);
  if (!row || row.status !== "paid") return fail("not_paid", 409);
  if (row.paid_at && Date.parse(row.paid_at) < Date.now() - RECEIPT_HOURS * 3_600_000) return fail("too_late", 409);
  const stars = intIn(b.stars, 0, 5, 0);
  if (stars < 1) return fail("invalid", 400);
  const comment = typeof b.comment === "string" ? b.comment.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  const { error } = await adminClient().from("ratings").insert({ restaurant_id: row.restaurant_id, bill_id: row.id, stars, comment });
  if (error) return error.code === "23505" ? fail("already_rated", 409) : fail("server_error", 500);
  await broadcastChange(row.restaurant_id);
  return { ok: true, value: undefined };
}

/** Staff confirm payment for a table session or a seated ticket. Safe to tap twice. */
export interface PaidResult {
  receiptNo: number | null;
  /** Loyalty problems never undo a payment; they come back here for staff to see. */
  loyaltyError: string | null;
  redeemed: boolean;
}

export async function markPaid(r: Restaurant, b: Record<string, unknown>): Promise<Result<PaidResult>> {
  const method = typeof b.method === "string" && b.method ? b.method : null;
  if (method && (!ALL_METHODS.has(method) || !PAY_METHODS[r.country].includes(method as PayMethod))) return fail("bad_method", 400);
  let sessionId = typeof b.sessionId === "string" && UUID.test(b.sessionId) ? b.sessionId : null;
  const entryId = typeof b.entryId === "string" && UUID.test(b.entryId) ? b.entryId : null;
  if (!sessionId && !entryId) return fail("not_found", 404);
  if (!sessionId && entryId) {
    // A ticket seated at a real table bills through that table's session.
    const { data } = await adminClient().from("table_sessions").select("id").eq("entry_id", entryId).eq("restaurant_id", r.id).is("closed_at", null).maybeSingle();
    sessionId = (data as { id: string } | null)?.id ?? null;
  }
  const { data, error } = await adminClient()
    .rpc("tp_mark_paid", { p_restaurant_id: r.id, p_session_id: sessionId, p_entry_id: sessionId ? null : entryId, p_method: method })
    .single();
  if (error) {
    if (error.message.includes("empty_bill")) return fail("empty_bill", 409);
    if (error.message.includes("bad_method")) return fail("bad_method", 400);
    if (error.message.includes("not_found")) return fail("not_found", 404);
    return fail("server_error", 500);
  }
  const bill = data as BillRow;

  // Loyalty: earn on the number staff typed, else the one the guest gave; then spend a reward if chosen.
  let loyaltyError: string | null = null;
  let redeemed = false;
  if (r.loyalty.mode !== "off") {
    const phone = typeof b.phone === "string" && b.phone.trim() ? b.phone.trim().slice(0, 40) : null;
    let name = "";
    if (bill.entry_id) {
      const { data: e } = await adminClient().from("entries").select("name").eq("id", bill.entry_id).maybeSingle();
      name = (e as { name: string } | null)?.name ?? "";
    }
    const earned = await earnForBill(r, bill.id, phone, name);
    loyaltyError = earned.error;
    const rewardId = typeof b.rewardId === "string" ? b.rewardId : null;
    if (rewardId) {
      const memberId = earned.memberId ?? (typeof b.memberId === "string" ? b.memberId : null) ?? (phone ? await memberIdByPhone(r, phone) : null);
      const err = memberId ? await redeemReward(r, memberId, rewardId, bill.id) : "not_found";
      if (err) loyaltyError = loyaltyError ?? err;
      else redeemed = true;
    }
  }
  await broadcastChange(r.id);
  return { ok: true, value: { receiptNo: bill.receipt_no, loyaltyError, redeemed } };
}

/** Bills for the given table sessions / tickets, for staff screens. */
export async function billSummaries(sessionIds: string[], entryIds: string[]): Promise<{ bySession: Map<string, BillSummary>; byEntry: Map<string, BillSummary> }> {
  const db = adminClient();
  const [bs, be] = await Promise.all([
    sessionIds.length ? db.from("bills").select("*").in("session_id", sessionIds) : Promise.resolve({ data: [] }),
    entryIds.length ? db.from("bills").select("*").in("entry_id", entryIds) : Promise.resolve({ data: [] }),
  ]);
  const rows = [...((bs.data ?? []) as BillRow[]), ...((be.data ?? []) as BillRow[])];
  const paidIds = rows.filter((x) => x.status === "paid").map((x) => x.id);
  const stars = new Map<string, number>();
  if (paidIds.length) {
    const { data } = await db.from("ratings").select("bill_id, stars").in("bill_id", paidIds);
    for (const x of (data ?? []) as { bill_id: string; stars: number }[]) stars.set(x.bill_id, x.stars);
  }
  const bySession = new Map<string, BillSummary>();
  const byEntry = new Map<string, BillSummary>();
  for (const row of rows) {
    const s = toSummary(row, stars.get(row.id) ?? null);
    if (row.session_id) bySession.set(row.session_id, s);
    if (row.entry_id) byEntry.set(row.entry_id, s);
  }
  return { bySession, byEntry };
}

/** Average stars and count since a moment (today on the floor). */
export async function ratingSince(restaurantId: string, since: number): Promise<{ avg: number | null; count: number }> {
  const { data } = await adminClient().from("ratings").select("stars").eq("restaurant_id", restaurantId).gte("created_at", new Date(since).toISOString());
  const list = ((data ?? []) as { stars: number }[]).map((x) => x.stars);
  return { avg: list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null, count: list.length };
}

/** Bill source for a seated waitlist ticket. Uses the table's session when the party is at a real table. */
export async function sourceForEntry(e: Entry): Promise<BillSource> {
  const { data } = await adminClient().from("table_sessions").select("id").eq("entry_id", e.id).is("closed_at", null).maybeSingle();
  const sessionId = (data as { id: string } | null)?.id ?? null;
  return { restaurantId: e.restaurantId, sessionId, entryId: e.id, canRequest: tableIsOpen(e) };
}

/** A ticket's bill, including a paid one after the table closed (receipt + rating window). */
export async function billForEntry(e: Entry): Promise<Bill | null> {
  if (e.status !== "seated") return null;
  const src = await sourceForEntry(e);
  const bill = await billFor(src);
  if (bill || src.sessionId) return bill;
  // Table closed: look for a paid bill on the closed session or the ticket itself.
  const { data } = await adminClient()
    .from("bills")
    .select("*")
    .eq("entry_id", e.id)
    .eq("status", "paid")
    .gte("paid_at", new Date(Date.now() - RECEIPT_HOURS * 3_600_000).toISOString())
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as BillRow;
  const { data: rt } = await adminClient().from("ratings").select("stars, comment").eq("bill_id", row.id).maybeSingle();
  return toBill(row, (rt as { stars: number; comment: string } | null) ?? null);
}
