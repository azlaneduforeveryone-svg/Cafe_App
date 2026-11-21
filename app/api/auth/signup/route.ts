import { randomUUID } from "node:crypto";
import { db, persist } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { setSession } from "@/lib/session";
import { fail, json, readBody } from "@/lib/api";
import type { Restaurant } from "@/lib/types";

function makeSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "restaurant";
  const taken = new Set(db().restaurants.map((r) => r.slug));
  let slug = base;
  while (taken.has(slug)) slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  return slug;
}

export async function POST(req: Request) {
  const b = await readBody(req);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const restaurantName = typeof b.restaurantName === "string" ? b.restaurantName.trim().slice(0, 80) : "";
  const country = b.country === "SA" || b.country === "PK" ? b.country : null;

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || !restaurantName || !country) {
    return fail("fields", 400);
  }
  const data = db();
  if (data.staff.some((s) => s.email === email)) return fail("exists", 409);

  const d = new Date();
  const restaurant: Restaurant = {
    id: randomUUID(),
    slug: makeSlug(restaurantName),
    name: restaurantName,
    nameAr: "",
    nameUr: "",
    country,
    sections: [
      { id: "main", en: "Main Hall", ar: "الصالة الرئيسية", ur: "مین ہال" },
      { id: "family", en: "Family Section", ar: "قسم العائلات", ur: "فیملی سیکشن" },
    ],
    gracePeriodMin: 5,
    minutesPerParty: 6,
    plan: "free",
    alertsUsed: 0,
    alertsPeriod: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    nextTicket: 1,
    nowServing: 0,
    createdAt: Date.now(),
  };
  const staffId = randomUUID();
  data.restaurants.push(restaurant);
  data.staff.push({
    id: staffId,
    email,
    name,
    passwordHash: hashPassword(password),
    restaurantId: restaurant.id,
    role: "owner",
    createdAt: Date.now(),
  });
  persist();
  await setSession(staffId);
  return json({ ok: true });
}
