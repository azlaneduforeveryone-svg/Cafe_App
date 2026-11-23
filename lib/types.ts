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
}

export interface MenuCategory {
  id: string;
  nameEn: string;
  nameAr: string;
  nameUr: string;
  sort: number;
}

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
  sort: number;
}

export interface Menu {
  currency: string;
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
}

export interface Order {
  id: string;
  status: OrderStatus;
  items: OrderLine[];
  total: number;
  note: string;
  updatedAt: number;
}
