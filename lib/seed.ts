import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "./password";
import type { DB, Entry } from "./types";

export const DEMO_EMAIL = "demo@tablepulse.app";
export const DEMO_PASSWORD = "demo1234";
export const DEMO_SLUG = "zaffran-ember";

/** A demo restaurant so the app has something to show on first run. */
export function seed(data: DB) {
  const now = Date.now();
  const d = new Date();
  const restaurantId = randomUUID();
  data.restaurants.push({
    id: restaurantId,
    slug: DEMO_SLUG,
    name: "Zaffran & Ember Grill",
    nameAr: "مشويات زعفران وإمبر",
    nameUr: "زعفران اینڈ ایمبر گرل",
    country: "PK",
    sections: [
      { id: "main", en: "Main Hall", ar: "الصالة الرئيسية", ur: "مین ہال" },
      { id: "family", en: "Family Section", ar: "قسم العائلات", ur: "فیملی سیکشن" },
      { id: "patio", en: "Rooftop Patio", ar: "التراس الخارجي", ur: "روف ٹاپ پیٹیو" },
    ],
    gracePeriodMin: 5,
    minutesPerParty: 6,
    plan: "free",
    // Two alerts left, so the upgrade prompt shows on the third Notify.
    alertsUsed: 148,
    alertsPeriod: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    nextTicket: 104,
    nowServing: 100,
    createdAt: now,
  });
  data.staff.push({
    id: randomUUID(),
    email: DEMO_EMAIL,
    name: "Demo Host",
    passwordHash: hashPassword(DEMO_PASSWORD),
    restaurantId,
    role: "owner",
    createdAt: now,
  });
  const guests: Array<Pick<Entry, "ticketNumber" | "name" | "partySize" | "sectionId" | "lang" | "phone"> & { minsAgo: number }> = [
    { ticketNumber: 101, name: "Tariq Mahmood", partySize: 4, sectionId: "family", lang: "ur", phone: "+92 300 8412290", minsAgo: 14 },
    { ticketNumber: 102, name: "Sara Al-Qahtani", partySize: 2, sectionId: "patio", lang: "ar", phone: "", minsAgo: 9 },
    { ticketNumber: 103, name: "Daniel Brooks", partySize: 6, sectionId: "main", lang: "en", phone: "", minsAgo: 4 },
  ];
  for (const g of guests) {
    data.entries.push({
      id: randomUUID(),
      token: randomBytes(12).toString("base64url"),
      restaurantId,
      ticketNumber: g.ticketNumber,
      name: g.name,
      partySize: g.partySize,
      sectionId: g.sectionId,
      lang: g.lang,
      phone: g.phone,
      source: "qr",
      status: "waiting",
      onTheWay: false,
      joinedAt: now - g.minsAgo * 60_000,
      notifiedAt: null,
      notifyCount: 0,
      closedAt: null,
    });
  }
}
