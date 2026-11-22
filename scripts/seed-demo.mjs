// Creates (or resets) the demo restaurant in Supabase.
// Run from the project folder:  node --env-file=.env.local scripts/seed-demo.mjs
// Safe to run again: it resets the demo queue and counters.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = "demo@tablepulse.app";
const PASSWORD = "demo1234";
const SLUG = "zaffran-ember";

if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Run with: node --env-file=.env.local scripts/seed-demo.mjs");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const die = (msg, err) => {
  console.error(msg, err?.message ?? err ?? "");
  process.exit(1);
};

// 1. Demo login (already confirmed, so no email is needed).
let userId;
const created = await db.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
if (created.data?.user) {
  userId = created.data.user.id;
} else {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) die("Could not list users:", error);
  userId = data.users.find((u) => u.email === EMAIL)?.id;
  if (!userId) die("Could not create the demo user:", created.error);
  await db.auth.admin.updateUserById(userId, { password: PASSWORD });
}

// 2. Demo restaurant.
const { data: staff } = await db.from("staff").select("restaurant_id").eq("user_id", userId).maybeSingle();
let restaurantId = staff?.restaurant_id;
if (!restaurantId) {
  const { data, error } = await db
    .rpc("tp_create_restaurant", {
      p_user_id: userId,
      p_owner_name: "Demo Host",
      p_restaurant_name: "Zaffran & Ember Grill",
      p_country: "PK",
      p_base_slug: SLUG,
    })
    .single();
  if (error) die("Could not create the demo restaurant (did you run the SQL in supabase/migrations?):", error);
  restaurantId = data.id;
  if (data.slug !== SLUG) console.warn(`Note: "${SLUG}" was taken, the demo got the address /r/${data.slug}`);
}

const now = new Date();
const { error: updErr } = await db
  .from("restaurants")
  .update({
    name: "Zaffran & Ember Grill",
    name_ar: "مشويات زعفران وإمبر",
    name_ur: "زعفران اینڈ ایمبر گرل",
    sections: [
      { id: "main", en: "Main Hall", ar: "الصالة الرئيسية", ur: "مین ہال" },
      { id: "family", en: "Family Section", ar: "قسم العائلات", ur: "فیملی سیکشن" },
      { id: "patio", en: "Rooftop Patio", ar: "التراس الخارجي", ur: "روف ٹاپ پیٹیو" },
    ],
    plan: "free",
    // Two free alerts left, so the upgrade prompt shows on the third Notify.
    alerts_used: 148,
    alerts_period: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    next_ticket: 101,
    now_serving: 100,
    grace_period_min: 5,
    minutes_per_party: 6,
  })
  .eq("id", restaurantId);
if (updErr) die("Could not update the demo restaurant:", updErr);

// 3. Fresh queue with three waiting guests.
await db.from("entries").delete().eq("restaurant_id", restaurantId);
const guests = [
  { name: "Tariq Mahmood", size: 4, section: "family", lang: "ur", phone: "+92 300 8412290", minsAgo: 14 },
  { name: "Sara Al-Qahtani", size: 2, section: "patio", lang: "ar", phone: "", minsAgo: 9 },
  { name: "Daniel Brooks", size: 6, section: "main", lang: "en", phone: "", minsAgo: 4 },
];
for (const g of guests) {
  const { data, error } = await db
    .rpc("tp_join", {
      p_restaurant_id: restaurantId,
      p_name: g.name,
      p_party_size: g.size,
      p_section_id: g.section,
      p_lang: g.lang,
      p_phone: g.phone,
      p_source: "qr",
      p_max_active: 300,
    })
    .single();
  if (error) die("Could not add a demo guest:", error);
  await db.from("entries").update({ joined_at: new Date(Date.now() - g.minsAgo * 60_000).toISOString() }).eq("id", data.id);
}

console.log("Demo ready.");
console.log(`  Host login: ${EMAIL} / ${PASSWORD}`);
console.log(`  Guest page: /r/${SLUG}`);
