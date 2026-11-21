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
  plan: Plan;
  alertsUsed: number;
  alertsPeriod: string; // YYYY-MM, free alerts reset when it changes
  nextTicket: number;
  nowServing: number;
  createdAt: number;
}

export interface Staff {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  restaurantId: string;
  role: "owner";
  createdAt: number;
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

export interface DB {
  restaurants: Restaurant[];
  staff: Staff[];
  entries: Entry[];
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
}

export interface HostSnapshot {
  serverNow: number;
  restaurant: PublicRestaurant & {
    plan: Plan;
    alertsUsed: number;
    freeLimit: number;
    minutesPerParty: number;
    nowServing: number;
  };
  entries: HostEntry[];
  stats: { seatedToday: number; noShowToday: number; avgWaitToday: number | null };
}

export interface TicketSnapshot {
  serverNow: number;
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
}
