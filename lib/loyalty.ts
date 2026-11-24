import "server-only";
import { adminClient } from "./supabase/admin";
import type { LoyaltyMemberRow, LoyaltyMemberView, LoyaltyMode, LoyaltyPromo, LoyaltyReceipt, LoyaltyReward, Restaurant } from "./types";

/**
 * Loyalty by phone number. The phone is never proof of identity, so:
 * earning happens only when staff mark a bill paid, spending only by staff (who see the
 * member's name), and guests only ever see a balance on their own paid receipt.
 */

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string; status: number };
const fail = (error: string, status: number) => ({ ok: false as const, error, status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const maskPhone = (p: string | null | undefined) => (p ? `••${p.slice(-4)}` : null);

interface RewardRow {
  id: string;
  kind: "stamps" | "points";
  name_en: string;
  name_ar: string;
  name_ur: string;
  cost: number;
  active: boolean;
}
interface MemberRow {
  id: string;
  restaurant_id: string;
  phone: string;
  name: string;
  stamps: number;
  points: number;
  visits: number;
  created_at: string;
  last_visit_at: string | null;
}

const toReward = (w: RewardRow): LoyaltyReward => ({ id: w.id, kind: w.kind, nameEn: w.name_en, nameAr: w.name_ar || w.name_en, nameUr: w.name_ur || w.name_en, cost: w.cost, active: w.active });

export async function listRewards(restaurantId: string, onlyActive = false): Promise<LoyaltyReward[]> {
  let q = adminClient().from("loyalty_rewards").select("*").eq("restaurant_id", restaurantId).order("kind").order("cost").order("sort");
  if (onlyActive) q = q.eq("active", true);
  const { data } = await q;
  return ((data ?? []) as RewardRow[]).map(toReward);
}

/** How the programme works, for the guest's bill sheet. Null when loyalty is off. */
export async function loyaltyPromo(r: Restaurant): Promise<LoyaltyPromo | null> {
  const mode = r.loyalty.mode;
  if (mode === "off") return null;
  const rewards = (await listRewards(r.id, true)).filter((w) => w.kind === mode).slice(0, 4);
  return {
    mode,
    stampsNeeded: r.loyalty.stampsNeeded,
    stampMinSpend: r.loyalty.stampMinSpend,
    spendPerPoint: r.loyalty.spendPerPoint,
    rewards: rewards.map(({ nameEn, nameAr, nameUr, cost }) => ({ nameEn, nameAr, nameUr, cost })),
  };
}

/** Progress for a paid bill's receipt, or null when that bill earned nothing. */
export async function receiptLoyalty(restaurantId: string, billId: string): Promise<LoyaltyReceipt | null> {
  const db = adminClient();
  const { data: ev } = await db.from("loyalty_events").select("member_id, stamps, points").eq("bill_id", billId).eq("kind", "earn").maybeSingle();
  if (!ev) return null;
  const e = ev as { member_id: string; stamps: number; points: number };
  const [{ data: m }, { data: r }] = await Promise.all([
    db.from("loyalty_members").select("stamps, points").eq("id", e.member_id).maybeSingle(),
    db.from("restaurants").select("loyalty_mode, stamps_needed").eq("id", restaurantId).maybeSingle(),
  ]);
  if (!m || !r) return null;
  const mem = m as { stamps: number; points: number };
  const rest = r as { loyalty_mode: LoyaltyMode; stamps_needed: number };
  const mode = rest.loyalty_mode === "points" ? "points" : "stamps";
  const balance = mode === "stamps" ? mem.stamps : mem.points;
  const rewards = (await listRewards(restaurantId, true)).filter((w) => w.kind === mode);
  const ready = rewards.filter((w) => w.cost <= balance).sort((a, b) => b.cost - a.cost)[0];
  const next = ready ?? rewards.filter((w) => w.cost > balance).sort((a, b) => a.cost - b.cost)[0];
  return {
    mode,
    earnedStamps: e.stamps,
    earnedPoints: e.points,
    stamps: mem.stamps,
    points: mem.points,
    stampsNeeded: rest.stamps_needed,
    nextReward: next ? { nameEn: next.nameEn, nameAr: next.nameAr, nameUr: next.nameUr, cost: next.cost, ready: !!ready } : null,
  };
}

/** Normalised phone (digits with country code) or null. Same rules as tp_norm_phone in SQL. */
export async function normalisePhone(r: Restaurant, raw: string): Promise<string | null> {
  const { data } = await adminClient().rpc("tp_norm_phone", { p_country: r.country, p_raw: raw.slice(0, 40) });
  return typeof data === "string" && data ? data : null;
}

function memberView(m: MemberRow, rewards: LoyaltyReward[], mode: LoyaltyMode): LoyaltyMemberView {
  const balance = mode === "points" ? m.points : m.stamps;
  return {
    id: m.id,
    name: m.name,
    phoneMasked: maskPhone(m.phone) ?? "",
    stamps: m.stamps,
    points: m.points,
    visits: m.visits,
    rewards: rewards.filter((w) => w.active && w.kind === mode).map((w) => ({ ...w, affordable: w.cost <= balance })),
  };
}

/**
 * Staff lookup at Mark paid: by the number staff type, or by the number the guest put on this
 * table's bill (staff never need to see that number in full).
 */
export async function lookupMember(
  r: Restaurant,
  q: { phone?: string | null; sessionId?: string | null; entryId?: string | null },
): Promise<Result<{ member: LoyaltyMemberView | null; phoneMasked: string | null }>> {
  if (r.loyalty.mode === "off") return fail("loyalty_off", 409);
  const db = adminClient();
  let phone: string | null = null;
  if (q.phone && q.phone.trim()) {
    phone = await normalisePhone(r, q.phone);
    if (!phone) return fail("bad_phone", 400);
  } else {
    const sessionId = q.sessionId && UUID.test(q.sessionId) ? q.sessionId : null;
    let entryId = q.entryId && UUID.test(q.entryId) ? q.entryId : null;
    let sid = sessionId;
    if (!sid && entryId) {
      const { data } = await db.from("table_sessions").select("id").eq("entry_id", entryId).eq("restaurant_id", r.id).is("closed_at", null).maybeSingle();
      sid = (data as { id: string } | null)?.id ?? null;
      if (sid) entryId = null;
    }
    if (!sid && !entryId) return { ok: true, value: { member: null, phoneMasked: null } };
    const bq = sid ? db.from("bills").select("loyalty_phone").eq("session_id", sid).eq("restaurant_id", r.id) : db.from("bills").select("loyalty_phone").eq("entry_id", entryId!).is("session_id", null).eq("restaurant_id", r.id);
    const { data } = await bq.maybeSingle();
    phone = (data as { loyalty_phone: string | null } | null)?.loyalty_phone ?? null;
    if (!phone) return { ok: true, value: { member: null, phoneMasked: null } };
  }
  const { data } = await db.from("loyalty_members").select("*").eq("restaurant_id", r.id).eq("phone", phone).maybeSingle();
  const rewards = await listRewards(r.id, true);
  return { ok: true, value: { member: data ? memberView(data as MemberRow, rewards, r.loyalty.mode) : null, phoneMasked: maskPhone(phone) } };
}

const LOYALTY_ERRORS = ["bad_phone", "earn_limit", "not_paid", "not_enough", "reward_off", "not_found"];
const codeOf = (msg: string) => LOYALTY_ERRORS.find((c) => msg.includes(c)) ?? "server_error";

/** Earn on a bill that was just paid. Never throws: payment already happened. */
export async function earnForBill(r: Restaurant, billId: string, phone: string | null, name: string): Promise<{ memberId: string | null; error: string | null }> {
  if (r.loyalty.mode === "off") return { memberId: null, error: null };
  const { data, error } = await adminClient().rpc("tp_loyalty_earn", { p_restaurant_id: r.id, p_bill_id: billId, p_phone: phone, p_name: name }).maybeSingle();
  if (error) return { memberId: null, error: codeOf(error.message) };
  const id = (data as { id: string | null } | null)?.id ?? null;
  return { memberId: id, error: null };
}

export async function redeemReward(r: Restaurant, memberId: string, rewardId: string, billId: string | null): Promise<string | null> {
  if (!UUID.test(memberId) || !UUID.test(rewardId)) return "not_found";
  const { error } = await adminClient().rpc("tp_loyalty_redeem", { p_restaurant_id: r.id, p_member_id: memberId, p_reward_id: rewardId, p_bill_id: billId }).maybeSingle();
  return error ? codeOf(error.message) : null;
}

export async function memberIdByPhone(r: Restaurant, phone: string): Promise<string | null> {
  const p = await normalisePhone(r, phone);
  if (!p) return null;
  const { data } = await adminClient().from("loyalty_members").select("id").eq("restaurant_id", r.id).eq("phone", p).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Owner settings
// ---------------------------------------------------------------------------

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);

export async function saveLoyaltySettings(r: Restaurant, b: Record<string, unknown>): Promise<Result> {
  const mode = b.mode;
  if (mode !== "off" && mode !== "stamps" && mode !== "points") return fail("invalid", 400);
  if (mode !== "off" && r.plan !== "pro") return fail("pro_required", 402);
  const stampsNeeded = Math.round(num(b.stampsNeeded));
  const stampMinSpend = num(b.stampMinSpend);
  const spendPerPoint = num(b.spendPerPoint);
  if (!(stampsNeeded >= 3 && stampsNeeded <= 20) || !(stampMinSpend >= 0 && stampMinSpend <= 100000) || !(spendPerPoint > 0 && spendPerPoint <= 100000)) return fail("invalid", 400);
  const { error } = await adminClient()
    .from("restaurants")
    .update({ loyalty_mode: mode, stamps_needed: stampsNeeded, stamp_min_spend: Math.round(stampMinSpend * 100) / 100, spend_per_point: Math.round(spendPerPoint * 100) / 100 })
    .eq("id", r.id);
  if (error) return fail("server_error", 500);
  // Stamp mode always has one reward at exactly the card size; keep it in step.
  if (mode === "stamps") await adminClient().from("loyalty_rewards").update({ cost: stampsNeeded }).eq("restaurant_id", r.id).eq("kind", "stamps");
  return { ok: true, value: undefined };
}

const clean = (v: unknown, max = 60) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function saveReward(r: Restaurant, b: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const kind = b.kind === "points" ? "points" : b.kind === "stamps" ? "stamps" : null;
  const nameEn = clean(b.nameEn);
  if (!kind || !nameEn) return fail("invalid", 400);
  const cost = kind === "stamps" ? r.loyalty.stampsNeeded : Math.round(num(b.cost));
  if (!(cost >= 1 && cost <= 100000)) return fail("invalid", 400);
  const row = { restaurant_id: r.id, kind, name_en: nameEn, name_ar: clean(b.nameAr), name_ur: clean(b.nameUr), cost, active: b.active !== false };
  const db = adminClient();
  if (typeof b.id === "string" && UUID.test(b.id)) {
    const { data, error } = await db.from("loyalty_rewards").update(row).eq("id", b.id).eq("restaurant_id", r.id).select("id").maybeSingle();
    if (error) return fail("server_error", 500);
    if (!data) return fail("not_found", 404);
    return { ok: true, value: { id: b.id } };
  }
  const { count } = await db.from("loyalty_rewards").select("id", { count: "exact", head: true }).eq("restaurant_id", r.id);
  if ((count ?? 0) >= 20) return fail("too_many", 409);
  const { data, error } = await db.from("loyalty_rewards").insert(row).select("id").single();
  if (error || !data) return fail("server_error", 500);
  return { ok: true, value: { id: (data as { id: string }).id } };
}

export async function deleteReward(r: Restaurant, id: string): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  await adminClient().from("loyalty_rewards").delete().eq("id", id).eq("restaurant_id", r.id);
  return { ok: true, value: undefined };
}

export async function listMembers(r: Restaurant, search: string): Promise<{ members: LoyaltyMemberRow[]; total: number }> {
  const db = adminClient();
  let q = db.from("loyalty_members").select("*", { count: "exact" }).eq("restaurant_id", r.id).order("last_visit_at", { ascending: false, nullsFirst: false }).limit(100);
  const s = search.replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 40);
  if (s) {
    const digits = s.replace(/\D/g, "");
    q = digits.length >= 3 ? q.like("phone", `%${digits}%`) : q.ilike("name", `%${s}%`);
  }
  const { data, count } = await q;
  return {
    total: count ?? 0,
    members: ((data ?? []) as MemberRow[]).map((m) => ({
      id: m.id,
      name: m.name,
      phone: m.phone,
      stamps: m.stamps,
      points: m.points,
      visits: m.visits,
      lastVisitAt: m.last_visit_at ? Date.parse(m.last_visit_at) : null,
      createdAt: Date.parse(m.created_at),
    })),
  };
}

/** Owner removes a member and their history (e.g. the guest asked to be forgotten). */
export async function deleteMember(r: Restaurant, id: string): Promise<Result> {
  if (!UUID.test(id)) return fail("not_found", 404);
  const db = adminClient();
  const { data } = await db.from("loyalty_members").select("phone").eq("id", id).eq("restaurant_id", r.id).maybeSingle();
  if (!data) return fail("not_found", 404);
  await db.from("bills").update({ loyalty_phone: null }).eq("restaurant_id", r.id).eq("loyalty_phone", (data as { phone: string }).phone);
  await db.from("loyalty_members").delete().eq("id", id).eq("restaurant_id", r.id);
  return { ok: true, value: undefined };
}

/** Members, and earns / rewards in the last 24 hours. */
export async function loyaltyStats(restaurantId: string): Promise<{ members: number; earnedToday: number; redeemedToday: number }> {
  const db = adminClient();
  const iso = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [m, e, d] = await Promise.all([
    db.from("loyalty_members").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    db.from("loyalty_events").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("kind", "earn").gte("created_at", iso),
    db.from("loyalty_events").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("kind", "redeem").gte("created_at", iso),
  ]);
  return { members: m.count ?? 0, earnedToday: e.count ?? 0, redeemedToday: d.count ?? 0 };
}
