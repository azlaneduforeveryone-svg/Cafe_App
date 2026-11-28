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
  loyalty: LoyaltySettings;
  triviaOn: boolean;
  /** Waiters see every table, or only the ones assigned to them. */
  waiterScope: "all" | "assigned";
  /** Shown on the guest join page when set. */
  contact: { phone: string; address: string; city: string };
  /** Private business record (admin and owner only). */
  business: { legalName: string; crNumber: string; vatNumber: string };
}

export interface Staff {
  userId: string;
  email: string;
  name: string;
  restaurantId: string;
  role: "owner" | "manager" | "reception" | "waiter";
  phone: string;
}

export interface Entry {
  id: string;
  token: string;
  /** View-only party link (watch + trivia). Null for old entries. */
  viewToken: string | null;
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
  /** "off" unless the owner turned loyalty on and the restaurant is Pro. */
  loyaltyMode: LoyaltyMode;
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
  /** Kitchen notifications for the person looking (pre-order ready, out of stock). */
  inbox: { id: number; kind: "ready" | "out_of_stock"; table: string; body: string; at: number }[];
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
  bill: BillSummary | null;
}

export interface TicketSnapshot {
  serverNow: number;
  /** Live-update channel for this restaurant's guest screens. */
  channel: string;
  /** For the "share with your party" link while waiting. Null once seated or gone. */
  viewToken: string | null;
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
  table: { open: boolean; label: string; orders: Order[]; bill: Bill | null; loyalty: LoyaltyPromo | null; atTable: boolean } | null;
  /** Trivia is on here (shown to parties still waiting). */
  triviaOn: boolean;
}

/** What the party sees from a view-only link (SEC-10): no names, phones, orders or actions. */
export interface PartySnapshot {
  serverNow: number;
  channel: string;
  restaurant: PublicRestaurant;
  entry: { ticketNumber: number; partySize: number; status: EntryStatus; onTheWay: boolean; notifiedAt: number | null; tableLabel: string };
  position: number;
  ahead: number;
  eta: number;
  nowServing: number;
  triviaOn: boolean;
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

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export type PayMethod = "cash" | "card" | "mada" | "apple_pay" | "google_pay" | "stc_pay" | "jazzcash" | "easypaisa" | "raast";
export const PAY_METHODS: Record<Country, PayMethod[]> = {
  SA: ["cash", "card", "mada", "apple_pay", "stc_pay", "google_pay"],
  PK: ["cash", "card", "jazzcash", "easypaisa", "raast"],
};
export const TIP_CHOICES = [0, 5, 10, 15] as const;

export interface BillLine {
  id: string;
  nameEn: string;
  nameAr: string;
  nameUr: string;
  price: number;
  qty: number;
  portion: Portion | null;
  spice: SpiceLevel | null;
}

/**
 * "open": food has been approved but the guest hasn't asked for the bill yet (a preview).
 * "requested": the guest asked; staff see it on the floor. "paid": staff confirmed payment.
 */
export interface Bill {
  id: string | null;
  status: "open" | "requested" | "paid";
  subtotal: number;
  tipPct: number;
  tipAmount: number;
  total: number;
  splitWays: number;
  perPerson: number;
  method: PayMethod;
  receiptNo: number | null;
  lines: BillLine[];
  requestedAt: number | null;
  paidAt: number | null;
  rating: { stars: number; comment: string } | null;
  /** Last digits of the phone the guest gave for loyalty, e.g. "••6567". */
  loyaltyPhone: string | null;
  /** On a paid bill that earned: progress for the receipt. */
  loyalty: LoyaltyReceipt | null;
}

/** What staff see on a table card. */
export interface BillSummary {
  status: "requested" | "paid";
  subtotal: number;
  tipAmount: number;
  total: number;
  splitWays: number;
  perPerson: number;
  method: PayMethod;
  receiptNo: number | null;
  stars: number | null;
  loyaltyPhone: string | null;
}

// ---------------------------------------------------------------------------
// Loyalty
// ---------------------------------------------------------------------------

export type LoyaltyMode = "off" | "stamps" | "points";

export interface LoyaltySettings {
  /** Effective mode ("off" while not Pro). */
  mode: LoyaltyMode;
  /** What the owner chose, kept while on Free so it comes back on upgrade. */
  savedMode: LoyaltyMode;
  stampsNeeded: number;
  stampMinSpend: number;
  spendPerPoint: number;
}

export interface LoyaltyReward {
  id: string;
  kind: "stamps" | "points";
  nameEn: string;
  nameAr: string;
  nameUr: string;
  cost: number;
  active: boolean;
}

/** What a guest sees before paying: how the programme works. */
export interface LoyaltyPromo {
  mode: "stamps" | "points";
  stampsNeeded: number;
  stampMinSpend: number;
  spendPerPoint: number;
  rewards: Pick<LoyaltyReward, "nameEn" | "nameAr" | "nameUr" | "cost">[];
}

/** Shown on the paid receipt. */
export interface LoyaltyReceipt {
  mode: "stamps" | "points";
  earnedStamps: number;
  earnedPoints: number;
  stamps: number;
  points: number;
  stampsNeeded: number;
  /** Cheapest active reward still out of reach, or one they can already take. */
  nextReward: (Pick<LoyaltyReward, "nameEn" | "nameAr" | "nameUr" | "cost"> & { ready: boolean }) | null;
}

/** Staff view of a member (Mark paid lookup). */
export interface LoyaltyMemberView {
  id: string;
  name: string;
  phoneMasked: string;
  stamps: number;
  points: number;
  visits: number;
  rewards: (LoyaltyReward & { affordable: boolean })[];
}

/** Owner list. */
export interface LoyaltyMemberRow {
  id: string;
  name: string;
  phone: string;
  stamps: number;
  points: number;
  visits: number;
  lastVisitAt: number | null;
  createdAt: number;
}
