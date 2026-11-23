// Test restaurant based on Qalandari Food Truck (Aziziyah, Jeddah), for internal testing only.
// Run from the project folder:  node --env-file=.env.local scripts/seed-qalandari.mjs
// Safe to run again: it replaces this test restaurant's menu and resets its queue.
//
// What is real and what isn't:
//   * Dish names and the Special Daal Chawal price (SAR 10 full plate, SAR 8 regular) come from
//     the truck's public website. The opening hours (5 PM to 1 AM) too.
//   * The other prices are SAMPLE prices and say so in their description. Replace them from the
//     truck's printed menu before showing this to anyone at Qalandari.
//   * No photos: their photos belong to them. Add your own or ask them for permission.
//   * Don't use their name in marketing or public demos without their permission.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = "qalandari-test@tablepulse.app";
const SLUG = "qalandari-test";

if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Run with: node --env-file=.env.local scripts/seed-qalandari.mjs");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const die = (msg, err) => {
  console.error(msg, err?.message ?? err ?? "");
  process.exit(1);
};

// 1. Login with a random password (printed once at the end). Re-running sets a new one.
const password = crypto.randomBytes(9).toString("base64url");
let userId;
const created = await db.auth.admin.createUser({ email: EMAIL, password, email_confirm: true });
if (created.data?.user) userId = created.data.user.id;
else {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) die("Could not list users:", error);
  userId = data.users.find((u) => u.email === EMAIL)?.id;
  if (!userId) die("Could not create the test user:", created.error);
  await db.auth.admin.updateUserById(userId, { password });
}

// 2. Restaurant (Saudi Arabia, so prices are in SAR).
const { data: staff } = await db.from("staff").select("restaurant_id").eq("user_id", userId).maybeSingle();
let restaurantId = staff?.restaurant_id;
if (!restaurantId) {
  const { data, error } = await db
    .rpc("tp_create_restaurant", {
      p_user_id: userId,
      p_owner_name: "Qalandari test",
      p_restaurant_name: "Qalandari Food Truck (test)",
      p_country: "SA",
      p_base_slug: SLUG,
    })
    .single();
  if (error) die("Could not create the restaurant (run the SQL migrations first):", error);
  restaurantId = data.id;
}
const { data: rest } = await db.from("restaurants").select("slug").eq("id", restaurantId).single();

const { error: updErr } = await db
  .from("restaurants")
  .update({
    name: "Qalandari Food Truck (test)",
    name_ar: "قلندري بوفيه سيارة (تجربة)",
    name_ur: "قلندری فوڈ ٹرک (ٹیسٹ)",
    sections: [{ id: "main", en: "Truck window", ar: "نافذة السيارة", ur: "ٹرک کھڑکی" }],
    // The truck's opening hours. Dishes aren't tied to it, so the menu also works when you test in the morning.
    meal_periods: [{ id: "evening", en: "Evening", ar: "المساء", ur: "شام", start: "17:00", end: "01:00" }],
    grace_period_min: 5,
    minutes_per_party: 4,
  })
  .eq("id", restaurantId);
if (updErr) die("Could not update the restaurant (did you run 0005_menu_schedule_table_orders.sql?):", updErr);

// 3. Fresh queue, fresh menu.
await db.from("entries").delete().eq("restaurant_id", restaurantId);
await db.from("menu_items").delete().eq("restaurant_id", restaurantId);
await db.from("menu_categories").delete().eq("restaurant_id", restaurantId);

const { data: cats, error: catErr } = await db
  .from("menu_categories")
  .insert([
    { restaurant_id: restaurantId, name_en: "Rice plates", name_ar: "أطباق الأرز", name_ur: "چاول کی پلیٹیں", sort: 0 },
    { restaurant_id: restaurantId, name_en: "Burgers and rolls", name_ar: "برجر ولفائف", name_ur: "برگر اور رول", sort: 1 },
  ])
  .select("id, name_en");
if (catErr) die("Could not add categories:", catErr);
const cat = (n) => cats.find((c) => c.name_en === n).id;
const SAMPLE = { en: " (Sample price, not from their menu.)", ar: " (سعر تجريبي، ليس من قائمتهم.)", ur: " (نمونہ قیمت، ان کے مینیو سے نہیں۔)" };
const item = (o) => ({ restaurant_id: restaurantId, available: true, is_deal: false, compare_at_price: null, ...o });

const { error: itemErr } = await db.from("menu_items").insert([
  item({
    category_id: cat("Rice plates"), sort: 0, price: 10,
    name_en: "Special Daal Chawal (full plate)", name_ar: "دال مع الأرز الخاص (طبق كامل)", name_ur: "اسپیشل دال چاول (فل پلیٹ)",
    desc_en: "Their best seller: slow-cooked daal over rice with shami kabab, a boiled egg, a fried egg and fried chicken.",
    desc_ar: "الأكثر طلباً: دال مطهو ببطء فوق الأرز مع شامي كباب وبيضة مسلوقة وبيضة مقلية ودجاج مقلي.",
    desc_ur: "سب سے زیادہ بکنے والی ڈش: چاول پر آہستہ پکی دال، شامی کباب، ابلا انڈا، فرائی انڈا اور فرائیڈ چکن۔",
  }),
  item({
    category_id: cat("Rice plates"), sort: 1, price: 8,
    name_en: "Special Daal Chawal (regular)", name_ar: "دال مع الأرز الخاص (عادي)", name_ur: "اسپیشل دال چاول (ریگولر)",
    desc_en: "The smaller plate of their famous daal chawal.",
    desc_ar: "الطبق الأصغر من الدال مع الأرز الشهير.",
    desc_ur: "مشہور دال چاول کی چھوٹی پلیٹ۔",
  }),
  item({
    category_id: cat("Rice plates"), sort: 2, price: 15,
    name_en: "Chicken Pulao", name_ar: "بولاو دجاج", name_ur: "چکن پلاؤ",
    desc_en: "Rice cooked with chicken and whole spices." + SAMPLE.en,
    desc_ar: "أرز مطبوخ مع الدجاج والبهارات الكاملة." + SAMPLE.ar,
    desc_ur: "چکن اور ثابت مصالحوں کے ساتھ پکے چاول۔" + SAMPLE.ur,
  }),
  item({
    category_id: cat("Rice plates"), sort: 3, price: 15,
    name_en: "Chicken Biryani", name_ar: "برياني دجاج", name_ur: "چکن بریانی",
    desc_en: "Spiced chicken layered with rice." + SAMPLE.en,
    desc_ar: "دجاج متبل مع طبقات من الأرز." + SAMPLE.ar,
    desc_ur: "مصالحے دار چکن اور چاول کی تہیں۔" + SAMPLE.ur,
  }),
  item({
    category_id: cat("Burgers and rolls"), sort: 4, price: 7,
    name_en: "Anda Shami Burger", name_ar: "برجر شامي بالبيض", name_ur: "انڈا شامی برگر",
    desc_en: "Shami kabab and egg in a bun, street style." + SAMPLE.en,
    desc_ar: "شامي كباب وبيض في خبز البرجر على طريقة الشارع." + SAMPLE.ar,
    desc_ur: "بن میں شامی کباب اور انڈا، اسٹریٹ اسٹائل۔" + SAMPLE.ur,
  }),
  item({
    category_id: cat("Burgers and rolls"), sort: 5, price: 6,
    name_en: "Chicken Shawarma", name_ar: "شاورما دجاج", name_ur: "چکن شوارما",
    desc_en: "Chicken shawarma wrap." + SAMPLE.en,
    desc_ar: "لفافة شاورما دجاج." + SAMPLE.ar,
    desc_ur: "چکن شوارما رول۔" + SAMPLE.ur,
  }),
]);
if (itemErr) die("Could not add dishes:", itemErr);

console.log("Qalandari test restaurant ready (6 dishes, 2 categories, no photos).");
console.log(`  Host login: ${EMAIL} / ${password}   (new password every run; keep it private)`);
console.log(`  Guest page: /r/${rest.slug}`);
