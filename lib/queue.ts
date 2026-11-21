import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { db, persist } from "./db";
import { emitChange } from "./events";
import { isLocale } from "./i18n";
import type {
  Entry,
  GuestAction,
  HostAction,
  HostSnapshot,
  PublicRestaurant,
  Restaurant,
  Section,
  TicketSnapshot,
} from "./types";

export const FREE_LIMIT = 150;
const MAX_ACTIVE = 300;

const isActive = (e: Entry) => e.status === "waiting" || e.status === "notified";

function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Free alerts reset at the start of each calendar month (UTC). */
export function rollPeriod(r: Restaurant) {
  const p = currentPeriod();
  if (r.alertsPeriod !== p) {
    r.alertsPeriod = p;
    r.alertsUsed = 0;
  }
}

export function activeEntries(restaurantId: string): Entry[] {
  return db()
    .entries.filter((e) => e.restaurantId === restaurantId && isActive(e))
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

const waitingList = (restaurantId: string) => activeEntries(restaurantId).filter((e) => e.status === "waiting");

/** One formula everywhere: parties ahead plus you, times minutes per party. */
export const etaFor = (r: Restaurant, position: number) => Math.max(1, position) * r.minutesPerParty;
export const joinEta = (r: Restaurant) => etaFor(r, waitingList(r.id).length + 1);
export const waitingCount = (r: Restaurant) => waitingList(r.id).length;

export function getRestaurantBySlug(slug: string) {
  return db().restaurants.find((r) => r.slug === slug) ?? null;
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
  };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function hostSnapshot(r: Restaurant): HostSnapshot {
  rollPeriod(r);
  const today = startOfToday();
  const closedToday = db().entries.filter((e) => e.restaurantId === r.id && e.closedAt !== null && e.closedAt >= today);
  const seated = closedToday.filter((e) => e.status === "seated");
  const avgWaitToday = seated.length
    ? Math.round(seated.reduce((sum, e) => sum + ((e.notifiedAt ?? e.closedAt!) - e.joinedAt), 0) / seated.length / 60_000)
    : null;
  return {
    serverNow: Date.now(),
    restaurant: {
      ...toPublic(r),
      plan: r.plan,
      alertsUsed: r.alertsUsed,
      freeLimit: FREE_LIMIT,
      minutesPerParty: r.minutesPerParty,
      nowServing: r.nowServing,
    },
    entries: activeEntries(r.id).map((e) => ({
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
    })),
    stats: {
      seatedToday: seated.length,
      noShowToday: closedToday.filter((e) => e.status === "no_show").length,
      avgWaitToday,
    },
  };
}

export function entryByToken(token: string) {
  return db().entries.find((e) => e.token === token) ?? null;
}

export function ticketSnapshot(token: string): TicketSnapshot | null {
  const e = entryByToken(token);
  if (!e) return null;
  const r = db().restaurants.find((x) => x.id === e.restaurantId);
  if (!r) return null;
  const waiting = waitingList(r.id);
  const position = e.status === "waiting" ? waiting.findIndex((x) => x.id === e.id) + 1 : 0;
  return {
    serverNow: Date.now(),
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
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface JoinInput {
  name: unknown;
  partySize: unknown;
  sectionId: unknown;
  lang: unknown;
  phone: unknown;
}

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string; status: number };

export function joinQueue(r: Restaurant, input: JoinInput, source: "qr" | "walkin"): Result<Entry> {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  const partySize = Number(input.partySize);
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!name) return { ok: false, error: "name_required", status: 400 };
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30) return { ok: false, error: "bad_party_size", status: 400 };
  if (phone && !/^[+\d][\d\s-]{5,19}$/.test(phone)) return { ok: false, error: "bad_phone", status: 400 };
  if (activeEntries(r.id).length >= MAX_ACTIVE) return { ok: false, error: "queue_full", status: 429 };

  const section = r.sections.find((s) => s.id === input.sectionId) ?? r.sections[0];
  const entry: Entry = {
    id: randomUUID(),
    token: randomBytes(12).toString("base64url"),
    restaurantId: r.id,
    ticketNumber: r.nextTicket++,
    name,
    partySize,
    sectionId: section?.id ?? "",
    lang: isLocale(input.lang) ? input.lang : "en",
    phone,
    source,
    status: "waiting",
    onTheWay: false,
    joinedAt: Date.now(),
    notifiedAt: null,
    notifyCount: 0,
    closedAt: null,
  };
  db().entries.push(entry);
  persist();
  emitChange(r.id);
  return { ok: true, value: entry };
}

export function hostAction(r: Restaurant, entryId: string, action: HostAction): Result<Entry> {
  const e = db().entries.find((x) => x.id === entryId && x.restaurantId === r.id);
  if (!e || !isActive(e)) return { ok: false, error: "not_found", status: 404 };
  const now = Date.now();

  if (action === "notify") {
    // Only the first buzz counts against the free plan. Buzz again restarts the countdown.
    if (e.status === "waiting") {
      rollPeriod(r);
      if (r.plan === "free" && r.alertsUsed >= FREE_LIMIT) return { ok: false, error: "limit_reached", status: 402 };
      if (r.plan === "free") r.alertsUsed++;
      e.status = "notified";
      r.nowServing = Math.max(r.nowServing, e.ticketNumber);
    }
    e.notifiedAt = now;
    e.notifyCount++;
  } else {
    e.status = action === "seat" ? "seated" : "no_show";
    e.closedAt = now;
  }
  persist();
  emitChange(r.id);
  return { ok: true, value: e };
}

export function guestAction(token: string, action: GuestAction): Result {
  const e = entryByToken(token);
  if (!e || !isActive(e)) return { ok: false, error: "not_found", status: 404 };
  if (action === "on_way") {
    if (e.status !== "notified") return { ok: false, error: "not_notified", status: 409 };
    e.onTheWay = true;
  } else {
    e.status = "left";
    e.closedAt = Date.now();
  }
  persist();
  emitChange(e.restaurantId);
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

export function updateSettings(r: Restaurant, input: SettingsInput): Result<Restaurant> {
  const name = str(input.name);
  if (!name) return { ok: false, error: "name_required", status: 400 };
  r.name = name;
  r.nameAr = str(input.nameAr);
  r.nameUr = str(input.nameUr);

  if (Array.isArray(input.sections)) {
    const sections: Section[] = [];
    for (const raw of input.sections.slice(0, 12)) {
      const s = (raw ?? {}) as Record<string, unknown>;
      const en = str(s.en, 40);
      if (!en) continue;
      const id = typeof s.id === "string" && /^[a-z0-9-]{1,40}$/.test(s.id) ? s.id : randomUUID().slice(0, 8);
      sections.push({ id, en, ar: str(s.ar, 40) || en, ur: str(s.ur, 40) || en });
    }
    if (!sections.length) return { ok: false, error: "section_required", status: 400 };
    r.sections = sections;
  }
  r.gracePeriodMin = clampInt(input.gracePeriodMin, 1, 30) ?? r.gracePeriodMin;
  r.minutesPerParty = clampInt(input.minutesPerParty, 1, 60) ?? r.minutesPerParty;
  persist();
  emitChange(r.id);
  return { ok: true, value: r };
}
