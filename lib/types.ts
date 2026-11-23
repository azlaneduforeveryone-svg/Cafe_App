export type Locale = "en" | "ar" | "ur";
export type Country = "SA" | "PK";
export type Plan = "free" | "pro";
export type EntryStatus = "waiting" | "notified" | "seated" | "no_show" | "left";
export type HostAction = "notify" | "seat" | "no_show";
export type GuestAction = "on_way" | "leave";

export interface Section {
  id: string;
  en: string;
  ar: string;
  ur: string;
}

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  nameUr: string;
  country: Country;
  sections: Section[];
  gracePeriodMin: number;
  minutesPerParty: number;
  /** Effective plan: "pro" while paid, on trial, or set to pro by hand. */
  plan: Plan;
  /** The plan column as stored (only "pro" when set by hand / test mode). */
  basePlan: Plan;
  proUntil: number | null;
  trialEndsAt: number | null;
  mealPeriods: MealPeriod[];
  stations: Station[];
  alertsUsed: number;
  alertsPeriod: string; // YYYY-MM, free alerts reset when it changes
  nextTicket: number;
  nowServing: number;
  createdAt: number;
  logoPath: string | null;
}

export interface Staff {
  userId: string;
  email: string;
  name: string;
  restaurantId: string;
  role: "owner" | "host";
}

export interface Entry {
  id: string;
  token: string;
  restaurantId: string;
  ticketNumber: number;
  name: string;
  partySize: number;
  sectionId: string;
  lang: Locale;
  phone: string;
  source: "qr" | "walkin";
  status: EntryStatus;
  onTheWay: boolean;
  joinedAt: number;
  notifiedAt: number | null;
  notifyCount: number;
  closedAt: number | null;
  tableLabel: string;
  tableClosedAt: number | null;
}

/** Restaurant fields that are safe to send to guests. */
export interface PublicRestaurant {
  slug: string;
  name: string;
  nameAr: string;
  nameUr: string;
  country: Country;
  sections: Section[];
  gracePeriodMin: number;
  logoUrl: string | null;
}

export interface HostEntry {
  id: string;
  ticketNumber: number;
  name: string;
  partySize: number;
  sectionId: string;
  lang: Locale;
  phone: string;
  source: "qr" | "walkin";
  status: EntryStatus;
  onTheWay: boolean;
  joinedAt: number;
  notifiedAt: number | null;
  order: Order | null;
}

export interface HostSnapshot {
  serverNow: number;
  channel: string;
  restaurant: PublicRestaurant & {
    plan: Plan;
    alertsUsed: number;
    freeLimit: number;
    minutesPerParty: number;
    nowServing: number;
    currency: string;
  };
  entries: HostEntry[];
  stats: { seatedToday: number; noShowToday: number; avgWaitToday: number | null };
  /** Seated parties whose table is still open for ordering. */
  tables: HostTable[];
  /** Dining tables with no guests right now (empty when the restaurant hasn't set up tables). */
  freeTables: { id: string; number: string; capacity: number; sectionId: string }[];
  hasTables: boolean;
}

export interface HostTable {
  id: string;
  ticketNumber: number;
  name: string;
  partySize: number;
  sectionId: string;
  seatedAt: number;
  label: string;
  /** Pre-order (if any) and every round ordered at the table, oldest first. */
  orders: Order[];
}

export interface TicketSnapshot {
  serverNow: number;
  /** Restaurant id, used as the live-update channel name. */
  channel: string;
  restaurant: PublicRestaurant;
  entry: {
    ticketNumber: number;
    name: string;
    partySize: number;
    sectionId: string;
    status: EntryStatus;
    onTheWay: boolean;
    joinedAt: number;
    notifiedAt: number | null;
    notifyCount: number;
  };
  position: number;
  ahead: number;
  eta: number;
  nowServing: number;
  currency: string;
  order: Order | null;
  hasMenu: boolean;
  /** Present after the guest is seated. */
  table: { open: boolean; label: string; orders: Order[] } | null;
}

export interface MenuCategory {
  id: string;
  nameEn: string;
  nameAr: string;
  nameUr: string;
  sort: number;
  /** Bitmask Mon 1 ... Sun 64; 127 = every day. */
  days: number;
  /** Meal time ids; empty = all day. */
  periods: string[];
}

/** A named time window set by the restaurant, e.g. Lunch 12:00-16:00. May cross midnight. */
export interface MealPeriod {
  id: string;
  en: string;
  ar: string;
  ur: string;
  start: string; // HH:MM
  end: string; // HH:MM
}

/** A kitchen station (e.g. Tandoor). Dishes are routed to its column on the kitchen display. */
export interface Station {
  id: string;
  en: string;
  ar: string;
  ur: string;
}

/** A size with its own price (e.g. Half 18, Full 32). */
export interface Portion {
  id: string;
  en: string;
  ar: string;
  ur: string;
  price: number;
}

export type SpiceLevel = "mild" | "medium" | "hot";
export const SPICE_LEVELS: SpiceLevel[] = ["mild", "medium", "hot"];
export const ALLERGENS = ["dairy", "nuts", "gluten", "egg", "seafood", "soy", "sesame"] as const;
export type Allergen = (typeof ALLERGENS)[number];

export interface MenuItem {
  id: string;
  categoryId: string | null;
  nameEn: string;
  nameAr: string;
  nameUr: string;
  descEn: string;
  descAr: string;
  descUr: string;
  price: number;
  compareAtPrice: number | null;
  isDeal: boolean;
  imagePath: string | null;
  imageUrl: string | null;
  available: boolean;
  /** When sold out "until tomorrow": the time it comes back by itself. */
  backAt: number | null;
  days: number;
  periods: string[];
  /** Worked out by the database for right now. */
  inStock: boolean;
  onSchedule: boolean;
  station: string;
  allergens: Allergen[];
  spiceLevels: SpiceLevel[];
  portions: Portion[];
  upsellItemId: string | null;
  sort: number;
}

export interface Menu {
  currency: string;
  mealPeriods: MealPeriod[];
  stations: Station[];
  categories: MenuCategory[];
  items: MenuItem[];
}

export type OrderStatus = "submitted" | "accepted" | "cancelled";

export interface OrderLine {
  id: string;
  qty: number;
  nameEn: string;
  nameAr: string;
  nameUr: string;
  price: number;
  station?: string;
  spice?: SpiceLevel | null;
  portion?: { id: string; en: string; ar: string; ur: string } | null;
}

export type OrderStage = "ordered" | "cooking" | "ready" | "served" | "cancelled";

export interface Order {
  id: string;
  kind: "pre" | "table";
  round: number;
  status: OrderStatus;
  items: OrderLine[];
  total: number;
  note: string;
  createdAt: number;
  updatedAt: number;
  acceptedAt: number | null;
  readyAt: number | null;
  servedAt: number | null;
  stationReady: Record<string, string>;
}

export function stageOf(o: Pick<Order, "status" | "readyAt" | "servedAt">): OrderStage {
  if (o.status === "cancelled") return "cancelled";
  if (o.status === "submitted") return "ordered";
  if (o.servedAt) return "served";
  if (o.readyAt) return "ready";
  return "cooking";
}
