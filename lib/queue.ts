import "server-only";
import { adminClient } from "./supabase/admin";
import { broadcastChange } from "./realtime";
import { isLocale } from "./i18n";
import { publicUrl } from "./media";
import { cancelOpenOrder, currencyOf, hasMenu, orderForEntry, ordersForEntries } from "./menu";
import type {
  Country,
  Entry,
  GuestAction,
  HostAction,
  HostSnapshot,
  Plan,
  PublicRestaurant,
  Restaurant,
  Section,
  TicketSnapshot,
} from "./types";

export const FREE_LIMIT = 150;
const MAX_ACTIVE = 300;
const ACTIVE = ["waiting", "notified"];

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string; status: number };
const fail = (error: string, status: number) => ({ ok: false as const, error, status });

// ---------------------------------------------------------------------------
// Row mapping (database uses snake_case and ISO timestamps)
// ---------------------------------------------------------------------------

interface RestaurantRow {
  id: string;
  slug: string;
  name: string;
  name_ar: string;
  name_ur: string;
  country: Country;
  sections: Section[];
  grace_period_min: number;
  minutes_per_party: number;
  plan: Plan;
  alerts_used: number;
  alerts_period: string;
  next_ticket: number;
  now_serving: number;
  created_at: string;
  logo_path: string | null;
}

interface EntryRow {
  id: string;
  token: string;
  restaurant_id: string;
  ticket_number: number;
  name: string;
  party_size: number;
  section_id: string;
  lang: Entry["lang"];
  phone: string;
  source: Entry["source"];
  status: Entry["status"];
  on_the_way: boolean;
  joined_at: string;
  notified_at: string | null;
  notify_count: number;
  closed_at: string | null;
}

const ms = (t: string | null) => (t ? Date.parse(t) : null);

export function toRestaurant(row: RestaurantRow): Restaurant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameAr: row.name_ar,
    nameUr: row.name_ur,
    country: row.country,
    sections: Array.isArray(row.sections) ? row.sections : [],
    gracePeriodMin: row.grace_period_min,
    minutesPerParty: row.minutes_per_party,
    plan: row.plan,
    alertsUsed: row.alerts_used,
    alertsPeriod: row.alerts_period,
    nextTicket: row.next_ticket,
    nowServing: row.now_serving,
    createdAt: Date.parse(row.created_at),
    logoPath: row.logo_path ?? null,
  };
}

function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    token: row.token,
    restaurantId: row.restaurant_id,
    ticketNumber: row.ticket_number,
    name: row.name,
    partySize: row.party_size,
    sectionId: row.section_id,
    lang: row.lang,
    phone: row.phone,
    source: row.source,
    status: row.status,
    onTheWay: row.on_the_way,
    joinedAt: Date.parse(row.joined_at),
    notifiedAt: ms(row.notified_at),
    notifyCount: row.notify_count,
    closedAt: ms(row.closed_at),
  };
}

/** Turns a database error into one of our short error codes. */
function dbError(message: string | undefined): { error: string; status: number } {
  const m = message ?? "";
  if (m.includes("limit_reached")) return { error: "limit_reached", status: 402 };
  if (m.includes("queue_full")) return { error: "queue_full", status: 429 };
  if (m.includes("not_found")) return { error: "not_found", status: 404 };
  if (m.includes("violates check constraint")) return { error: "invalid", status: 400 };
  console.error("[tablepulse] database error:", m);
  return { error: "server_error", status: 500 };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Free alerts used this month. Shows 0 once the month turns, before the next buzz saves it. */
export const alertsUsedNow = (r: Restaurant) => (r.alertsPeriod === currentPeriod() ? r.alertsUsed : 0);

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const { data } = await adminClient().from("restaurants").select("*").eq("slug", slug).maybeSingle();
  return data ? toRestaurant(data as RestaurantRow) : null;
}

export async function getRestaurantById(id: string): Promise<Restaurant | null> {
  const { data } = await adminClient().from("restaurants").select("*").eq("id", id).maybeSingle();
  return data ? toRestaurant(data as RestaurantRow) : null;
}

async function activeEntries(restaurantId: string): Promise<Entry[]> {
  const { data, error } = await adminClient()
    .from("entries")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .in("status", ACTIVE)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as EntryRow[]).map(toEntry);
}

async function waitingCount(restaurantId: string): Promise<number> {
  const { count } = await adminClient()
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("status", "waiting");
  return count ?? 0;
}

/** One formula everywhere: your place in line times minutes per party. */
export const etaFor = (r: Restaurant, position: number) => Math.max(1, position) * r.minutesPerParty;

/** What the join page shows before a guest joins. */
export async function joinInfo(r: Restaurant) {
  const waiting = await waitingCount(r.id);
  return { waiting, eta: etaFor(r, waiting + 1) };
}

export function toPublic(r: Restaurant): PublicRestaurant {
  return {
    slug: r.slug,
    name: r.name,
    nameAr: r.nameAr,
    nameUr: r.nameUr,
    country: r.country,
    sections: r.sections,
    gracePeriodMin: r.gracePeriodMin,
    logoUrl: publicUrl(r.logoPath),
  };
}

/** Midnight in the restaurant's own time zone (neither country uses daylight saving). */
function startOfToday(country: Country) {
  const offset = (country === "SA" ? 3 : 5) * 3_600_000;
  return Math.floor((Date.now() + offset) / 86_400_000) * 86_400_000 - offset;
}

export async function hostSnapshot(r: Restaurant): Promise<HostSnapshot> {
  const since = new Date(startOfToday(r.country)).toISOString();
  const [entries, closed] = await Promise.all([
    activeEntries(r.id),
    adminClient()
      .from("entries")
      .select("status, joined_at, notified_at, closed_at")
      .eq("restaurant_id", r.id)
      .gte("closed_at", since),
  ]);
  const orders = await ordersForEntries(entries.map((e) => e.id));
  const closedToday = (closed.data ?? []) as Pick<EntryRow, "status" | "joined_at" | "notified_at" | "closed_at">[];
  const seated = closedToday.filter((e) => e.status === "seated");
  const avgWaitToday = seated.length
    ? Math.round(
        seated.reduce((sum, e) => sum + (Date.parse(e.notified_at ?? e.closed_at!) - Date.parse(e.joined_at)), 0) / seated.length / 60_000,
      )
    : null;

  return {
    serverNow: Date.now(),
    channel: r.id,
    restaurant: {
      ...toPublic(r),
      plan: r.plan,
      alertsUsed: alertsUsedNow(r),
      freeLimit: FREE_LIMIT,
      minutesPerParty: r.minutesPerParty,
      nowServing: r.nowServing,
      currency: currencyOf(r),
    },
    entries: entries.map((e) => ({
      id: e.id,
      ticketNumber: e.ticketNumber,
      name: e.name,
      partySize: e.partySize,
      sectionId: e.sectionId,
      lang: e.lang,
      phone: e.phone,
      source: e.source,
      status: e.status,
      onTheWay: e.onTheWay,
      joinedAt: e.joinedAt,
      notifiedAt: e.notifiedAt,
      order: orders.get(e.id) ?? null,
    })),
    stats: {
      seatedToday: seated.length,
      noShowToday: closedToday.filter((e) => e.status === "no_show").length,
      avgWaitToday,
    },
  };
}

export async function entryByToken(token: string): Promise<Entry | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const { data } = await adminClient().from("entries").select("*").eq("token", token).maybeSingle();
  return data ? toEntry(data as EntryRow) : null;
}

export async function ticketSnapshot(token: string): Promise<TicketSnapshot | null> {
  const e = await entryByToken(token);
  if (!e) return null;
  const r = await getRestaurantById(e.restaurantId);
  if (!r) return null;

  let position = 0;
  if (e.status === "waiting") {
    const { data } = await adminClient()
      .from("entries")
      .select("id")
      .eq("restaurant_id", r.id)
      .eq("status", "waiting")
      .order("joined_at", { ascending: true });
    position = ((data ?? []) as { id: string }[]).findIndex((x) => x.id === e.id) + 1;
  }

  return {
    serverNow: Date.now(),
    channel: r.id,
    restaurant: toPublic(r),
    entry: {
      ticketNumber: e.ticketNumber,
      name: e.name,
      partySize: e.partySize,
      sectionId: e.sectionId,
      status: e.status,
      onTheWay: e.onTheWay,
      joinedAt: e.joinedAt,
      notifiedAt: e.notifiedAt,
      notifyCount: e.notifyCount,
    },
    position,
    ahead: Math.max(0, position - 1),
    eta: position ? etaFor(r, position) : 0,
    nowServing: r.nowServing,
    currency: currencyOf(r),
    order: await orderForEntry(e.id),
    hasMenu: await hasMenu(r.id),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface JoinInput {
  name?: unknown;
  partySize?: unknown;
  sectionId?: unknown;
  lang?: unknown;
  phone?: unknown;
}

export async function joinQueue(r: Restaurant, input: JoinInput, source: "qr" | "walkin"): Promise<Result<Entry>> {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  const partySize = Number(input.partySize);
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!name) return fail("name_required", 400);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30) return fail("bad_party_size", 400);
  if (phone && !/^[+\d][\d\s-]{5,19}$/.test(phone)) return fail("bad_phone", 400);

  const section = r.sections.find((s) => s.id === input.sectionId) ?? r.sections[0];
  const { data, error } = await adminClient()
    .rpc("tp_join", {
      p_restaurant_id: r.id,
      p_name: name,
      p_party_size: partySize,
      p_section_id: section?.id ?? "",
      p_lang: isLocale(input.lang) ? input.lang : "en",
      p_phone: phone,
      p_source: source,
      p_max_active: MAX_ACTIVE,
    })
    .single();
  if (error) {
    const e = dbError(error.message);
    return fail(e.error, e.status);
  }
  await broadcastChange(r.id);
  return { ok: true, value: toEntry(data as EntryRow) };
}

export async function hostAction(r: Restaurant, entryId: string, action: HostAction): Promise<Result<{ ticketNumber: number }>> {
  if (!/^[0-9a-f-]{36}$/i.test(entryId)) return fail("not_found", 404);
  let ticketNumber: number;

  if (action === "notify") {
    const { data, error } = await adminClient()
      .rpc("tp_notify", { p_restaurant_id: r.id, p_entry_id: entryId, p_free_limit: FREE_LIMIT })
      .single();
    if (error) {
      const e = dbError(error.message);
      return fail(e.error, e.status);
    }
    ticketNumber = (data as EntryRow).ticket_number;
  } else {
    const { data, error } = await adminClient()
      .from("entries")
      .update({ status: action === "seat" ? "seated" : "no_show", closed_at: new Date().toISOString() })
      .eq("id", entryId)
      .eq("restaurant_id", r.id)
      .in("status", ACTIVE)
      .select("ticket_number")
      .maybeSingle();
    if (error) {
      const e = dbError(error.message);
      return fail(e.error, e.status);
    }
    if (!data) return fail("not_found", 404);
    ticketNumber = (data as { ticket_number: number }).ticket_number;
    // A no-show's pre-order is dropped unless the kitchen already accepted it.
    if (action === "no_show") await cancelOpenOrder(entryId);
  }

  await broadcastChange(r.id);
  return { ok: true, value: { ticketNumber } };
}

export async function guestAction(token: string, action: GuestAction): Promise<Result> {
  const e = await entryByToken(token);
  if (!e || (e.status !== "waiting" && e.status !== "notified")) return fail("not_found", 404);
  if (action === "on_way" && e.status !== "notified") return fail("not_notified", 409);

  const patch = action === "on_way" ? { on_the_way: true } : { status: "left", closed_at: new Date().toISOString() };
  const { data, error } = await adminClient()
    .from("entries")
    .update(patch)
    .eq("id", e.id)
    .in("status", action === "on_way" ? ["notified"] : ACTIVE)
    .select("id")
    .maybeSingle();
  if (error) {
    const d = dbError(error.message);
    return fail(d.error, d.status);
  }
  if (!data) return fail("not_found", 404);
  if (action === "leave") await cancelOpenOrder(e.id);
  await broadcastChange(e.restaurantId);
  return { ok: true, value: undefined };
}

export interface SettingsInput {
  name?: unknown;
  nameAr?: unknown;
  nameUr?: unknown;
  sections?: unknown;
  gracePeriodMin?: unknown;
  minutesPerParty?: unknown;
}

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clampInt = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

export async function updateSettings(r: Restaurant, input: SettingsInput): Promise<Result> {
  const name = str(input.name);
  if (!name) return fail("name_required", 400);
  const patch: Record<string, unknown> = { name, name_ar: str(input.nameAr), name_ur: str(input.nameUr) };

  if (Array.isArray(input.sections)) {
    const sections: Section[] = [];
    for (const raw of input.sections.slice(0, 12)) {
      const s = (raw ?? {}) as Record<string, unknown>;
      const en = str(s.en, 40);
      if (!en) continue;
      const id = typeof s.id === "string" && /^[a-z0-9-]{1,40}$/.test(s.id) ? s.id : `s-${crypto.randomUUID().slice(0, 8)}`;
      sections.push({ id, en, ar: str(s.ar, 40) || en, ur: str(s.ur, 40) || en });
    }
    if (!sections.length) return fail("section_required", 400);
    patch.sections = sections;
  }
  const grace = clampInt(input.gracePeriodMin, 1, 30);
  const turn = clampInt(input.minutesPerParty, 1, 60);
  if (grace !== null) patch.grace_period_min = grace;
  if (turn !== null) patch.minutes_per_party = turn;

  const { error } = await adminClient().from("restaurants").update(patch).eq("id", r.id);
  if (error) {
    const e = dbError(error.message);
    return fail(e.error, e.status);
  }
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

/** Test-mode plan switch. Replace with the payment gateway's webhook. */
export async function setPlan(r: Restaurant, plan: Plan): Promise<Result> {
  const { error } = await adminClient().from("restaurants").update({ plan }).eq("id", r.id);
  if (error) {
    const e = dbError(error.message);
    return fail(e.error, e.status);
  }
  await broadcastChange(r.id);
  return { ok: true, value: undefined };
}

/** Creates the restaurant and owner row for a new Supabase Auth user. */
export async function createRestaurantForUser(input: {
  userId: string;
  ownerName: string;
  restaurantName: string;
  country: Country;
}): Promise<Result<Restaurant>> {
  const baseSlug = input.restaurantName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const { data, error } = await adminClient()
    .rpc("tp_create_restaurant", {
      p_user_id: input.userId,
      p_owner_name: input.ownerName,
      p_restaurant_name: input.restaurantName,
      p_country: input.country,
      p_base_slug: baseSlug,
    })
    .single();
  if (error) {
    const e = dbError(error.message);
    return fail(e.error, e.status);
  }
  return { ok: true, value: toRestaurant(data as RestaurantRow) };
}
