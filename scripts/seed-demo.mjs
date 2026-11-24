// Creates (or resets) the demo restaurant in Supabase.
// Run from the project folder:  node --env-file=.env.local scripts/seed-demo.mjs
// Safe to run again: it resets the demo queue, menu, tables, floor, loyalty and trivia.
// Needs every migration up to 0010 to have been run.
//
// The demo is set to Pro by hand so every feature (tables, loyalty, trivia) can be shown.
// The demo login is public while SHOW_DEMO_LOGIN=1: turn that off once real restaurants use the site.
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
    plan: "pro",
    alerts_used: 0,
    alerts_period: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    next_ticket: 101,
    now_serving: 100,
    grace_period_min: 5,
    minutes_per_party: 6,
    stations: [
      { id: "tandoor", en: "Tandoor", ar: "التنور", ur: "تنور" },
      { id: "curry", en: "Curry", ar: "الكاري", ur: "سالن" },
      { id: "drinks", en: "Drinks", ar: "المشروبات", ur: "مشروبات" },
    ],
    wifi_ssid: "ZaffranEmber-Guest",
    wifi_password: "kebab2026",
    loyalty_mode: "stamps",
    stamps_needed: 8,
    stamp_min_spend: 1000,
    spend_per_point: 100,
    trivia_on: true,
    next_receipt: 1,
  })
  .eq("id", restaurantId);
if (updErr) die("Could not update the demo restaurant:", updErr);
// Pro is set by hand above (plan = "pro"); clear any trial or paid period so nothing expires.
await db.from("restaurants").update({ trial_ends_at: null, pro_until: null }).eq("id", restaurantId);

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

// 4. Menu in three languages, by kitchen station, with sizes, spice levels and allergens.
//    Replaces the demo menu each run.
// Order matters: bills and orders first, then tables (which removes sessions, calls and trivia games).
await db.from("bills").delete().eq("restaurant_id", restaurantId);
await db.from("orders").delete().eq("restaurant_id", restaurantId);
await db.from("restaurant_tables").delete().eq("restaurant_id", restaurantId);
await db.from("menu_items").delete().eq("restaurant_id", restaurantId);
await db.from("menu_categories").delete().eq("restaurant_id", restaurantId);
const { data: cats, error: catErr } = await db
  .from("menu_categories")
  .insert([
    { restaurant_id: restaurantId, name_en: "Tandoor", name_ar: "التنور", name_ur: "تنور", sort: 0 },
    { restaurant_id: restaurantId, name_en: "Curry", name_ar: "الكاري", name_ur: "سالن", sort: 1 },
    { restaurant_id: restaurantId, name_en: "Drinks", name_ar: "المشروبات", name_ur: "مشروبات", sort: 2 },
    { restaurant_id: restaurantId, name_en: "Desserts", name_ar: "الحلويات", name_ur: "میٹھا", sort: 3 },
  ])
  .select("id, name_en");
if (catErr) die("Could not add menu categories:", catErr);
const cat = (name) => cats.find((c) => c.name_en === name)?.id ?? null;
const sizes = (half, full) => [
  { id: "half", en: "Half", ar: "نصف", ur: "ہاف", price: half },
  { id: "full", en: "Full", ar: "كامل", ur: "فل", price: full },
];
const dish = (o) => ({ restaurant_id: restaurantId, compare_at_price: null, is_deal: false, available: true, allergens: [], spice_levels: [], portions: [], station: "", ...o });
const { data: dishes, error: itemErr } = await db
  .from("menu_items")
  .insert([
    dish({
      category_id: null, sort: 0, is_deal: true, price: 4500, compare_at_price: 5600, allergens: ["dairy", "gluten"],
      name_en: "Family Feast Deal", name_ar: "عرض وليمة العائلة", name_ur: "فیملی فیسٹ ڈیل",
      desc_en: "Lamb chops, butter chicken, 4 naan and a jug of mint lemonade. Serves 4.",
      desc_ar: "ريش غنم ودجاج بالزبدة و٤ خبز نان وإبريق ليموناضة بالنعناع. يكفي ٤ أشخاص.",
      desc_ur: "لیمب چوپس، بٹر چکن، 4 نان اور پودینہ لیمونیڈ کا جگ۔ 4 افراد کے لیے۔",
    }),
    dish({
      category_id: cat("Tandoor"), sort: 1, price: 2850, station: "tandoor", spice_levels: ["mild", "medium", "hot"], allergens: ["dairy"],
      name_en: "Saffron Charcoal Lamb Chops", name_ar: "ريش غنم مشوية بالزعفران", name_ur: "زعفرانی چارکول لیمب چوپس",
      desc_en: "24-hour spiced marinade, smoked labneh, pomegranate glaze.",
      desc_ar: "تتبيلة بهارات ٢٤ ساعة مع لبنة مدخنة ودبس الرمان.",
      desc_ur: "24 گھنٹے میرینیٹ شدہ چانپیں، اسموکڈ لبنہ اور انار کی چٹنی کے ساتھ۔",
    }),
    dish({
      category_id: cat("Tandoor"), sort: 2, price: 1450, station: "tandoor", portions: sizes(850, 1450), spice_levels: ["mild", "medium", "hot"], allergens: ["dairy"],
      name_en: "Chicken Tikka", name_ar: "تكا دجاج", name_ur: "چکن تکہ",
      desc_en: "Bone-in chicken, yoghurt and Kashmiri chilli, charred in the tandoor.",
      desc_ar: "دجاج بالعظم مع اللبن والفلفل الكشميري، مشوي في التنور.",
      desc_ur: "ہڈی والا چکن، دہی اور کشمیری مرچ، تنور میں بھنا ہوا۔",
    }),
    dish({
      category_id: cat("Tandoor"), sort: 3, price: 1250, station: "tandoor", spice_levels: ["medium", "hot"],
      // Sold out until tomorrow, to show how that looks.
      available: false, back_at: new Date(Date.now() + 12 * 3_600_000).toISOString(),
      name_en: "Seekh Kebab", name_ar: "سيخ كباب", name_ur: "سیخ کباب",
      desc_en: "Hand-minced beef with green chilli and coriander, off the skewer.",
      desc_ar: "لحم بقري مفروم يدويًا مع الفلفل الأخضر والكزبرة، على السيخ.",
      desc_ur: "ہاتھ سے کوٹا ہوا قیمہ، ہری مرچ اور دھنیے کے ساتھ، سیخ سے تازہ۔",
    }),
    dish({
      category_id: cat("Tandoor"), sort: 4, price: 250, station: "tandoor", allergens: ["gluten", "dairy"],
      name_en: "Garlic Naan", name_ar: "خبز نان بالثوم", name_ur: "گارلک نان",
      desc_en: "Fresh from the tandoor, brushed with garlic butter.",
      desc_ar: "طازج من التنور، مدهون بزبدة الثوم.",
      desc_ur: "تنور سے تازہ، لہسن والے مکھن کے ساتھ۔",
    }),
    dish({
      category_id: cat("Curry"), sort: 5, price: 1950, station: "curry", portions: sizes(1100, 1950), allergens: ["dairy", "nuts"],
      name_en: "Ember Butter Chicken", name_ar: "دجاج بالزبدة على الجمر", name_ur: "ایمبر بٹر چکن",
      desc_en: "Tomato and fenugreek gravy, finished with cream.",
      desc_ar: "صلصة الطماطم والحلبة مع لمسة من القشطة.",
      desc_ur: "ٹماٹر اور میتھی کی گریوی، کریم کے ساتھ۔",
    }),
    dish({
      category_id: cat("Curry"), sort: 6, price: 3200, station: "curry", portions: sizes(1800, 3200), spice_levels: ["mild", "medium", "hot"],
      name_en: "Mutton Karahi", name_ar: "كراهي لحم الضأن", name_ur: "مٹن کڑاہی",
      desc_en: "Wok-cooked with tomato, ginger and green chilli. For two or four.",
      desc_ar: "مطبوخ في الكراهي مع الطماطم والزنجبيل والفلفل الأخضر.",
      desc_ur: "کڑاہی میں ٹماٹر، ادرک اور ہری مرچ کے ساتھ تیار۔",
    }),
    dish({
      category_id: cat("Curry"), sort: 7, price: 950, station: "curry", spice_levels: ["mild", "medium"],
      name_en: "Lahori Chana", name_ar: "حمص لاهوري", name_ur: "لاہوری چنے",
      desc_en: "Slow-cooked chickpeas with roasted spices. Vegetarian.",
      desc_ar: "حمص مطبوخ ببطء مع بهارات محمصة. نباتي.",
      desc_ur: "بھنے مصالحوں کے ساتھ آہستہ پکے چنے۔ سبزی خور۔",
    }),
    dish({
      category_id: cat("Drinks"), sort: 8, price: 450, station: "drinks",
      name_en: "Mint Lemonade", name_ar: "ليموناضة بالنعناع", name_ur: "پودینہ لیمونیڈ",
      desc_en: "Fresh lemon, mint and crushed ice.",
      desc_ar: "ليمون طازج ونعناع وثلج مجروش.",
      desc_ur: "تازہ لیموں، پودینہ اور کچلی برف۔",
    }),
    dish({
      category_id: cat("Drinks"), sort: 9, price: 400, station: "drinks", allergens: ["dairy"],
      name_en: "Sweet Lassi", name_ar: "لاسي حلو", name_ur: "میٹھی لسی",
      desc_en: "Chilled yoghurt drink with a pinch of cardamom.",
      desc_ar: "مشروب لبن بارد مع رشة هيل.",
      desc_ur: "ٹھنڈی دہی کی لسی، تھوڑی الائچی کے ساتھ۔",
    }),
    dish({
      category_id: cat("Drinks"), sort: 10, price: 350, station: "drinks", allergens: ["dairy", "nuts"],
      name_en: "Kashmiri Chai", name_ar: "شاي كشميري", name_ur: "کشمیری چائے",
      desc_en: "Pink tea with crushed pistachio and almond.",
      desc_ar: "شاي وردي مع الفستق واللوز المطحون.",
      desc_ur: "گلابی چائے، پسے پستے اور بادام کے ساتھ۔",
    }),
    dish({
      category_id: cat("Desserts"), sort: 11, price: 1150, allergens: ["dairy", "nuts", "gluten"],
      name_en: "Cardamom Pistachio Kunafa", name_ar: "كنافة بالفستق والهيل", name_ur: "الائچی اور پستہ کنافہ",
      desc_en: "Crisp kataifi pastry, sweet cream, crushed pistachios.",
      desc_ar: "عجينة كنافة مقرمشة مع قشطة وفستق مطحون.",
      desc_ur: "کرسپی کنافہ، ملائی اور پسے ہوئے پستے۔",
    }),
  ])
  .select("id, name_en");
if (itemErr) die("Could not add dishes (are migrations 0005 to 0007 run?):", itemErr);
const D = (name) => dishes.find((d) => d.name_en === name).id;
// Butter chicken suggests garlic naan.
await db.from("menu_items").update({ upsell_item_id: D("Garlic Naan") }).eq("id", D("Ember Butter Chicken"));

// 5. Five weeks of past visits so the Reports page has something to show (needs 0003_reports.sql
//    for the report itself, but the rows are plain entries and orders). Made-up but realistic:
//    busier Thursday to Saturday evenings, about 1 in 3 seated parties pre-order.
{
  const { data: menu } = await db.from("menu_items").select("id, name_en, name_ar, name_ur, price").eq("restaurant_id", restaurantId);
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const names = ["Ahmed", "Fatima", "Bilal", "Ayesha", "Omar", "Hina", "Usman", "Zainab", "Hamza", "Maryam"];
  const offsetH = 5; // Pakistan time
  const rows = [];
  const orderPlans = [];
  let ticket = 10_000;
  for (let daysAgo = 35; daysAgo >= 1; daysAgo--) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
    const dow = day.getUTCDay(); // 4 Thu, 5 Fri, 6 Sat
    const busy = dow === 4 || dow === 5 || dow === 6 ? 2 : 1;
    const parties = Math.round((12 + rnd() * 10) * busy);
    for (let i = 0; i < parties; i++) {
      const localHour = rnd() < 0.25 ? 13 + Math.floor(rnd() * 3) : 19 + Math.floor(rnd() * 5); // lunch or dinner
      const joined = new Date(day.getTime() + (localHour - offsetH) * 3_600_000 + Math.floor(rnd() * 60) * 60_000);
      const wait = Math.round((busy === 2 && localHour >= 20 ? 22 : 12) + rnd() * 15);
      const r = rnd();
      const status = r < 0.08 ? "no_show" : r < 0.13 ? "left" : "seated";
      const notified = status === "left" ? null : new Date(joined.getTime() + wait * 60_000);
      const closed = new Date(joined.getTime() + (wait + (status === "no_show" ? 6 : 2)) * 60_000);
      const row = {
        restaurant_id: restaurantId,
        ticket_number: ticket++,
        name: pick(names),
        party_size: 1 + Math.floor(rnd() * 6),
        section_id: pick(["main", "family", "patio"]),
        lang: pick(["en", "ur", "ur", "ar"]),
        source: rnd() < 0.8 ? "qr" : "walkin",
        status,
        joined_at: joined.toISOString(),
        notified_at: notified?.toISOString() ?? null,
        notify_count: notified ? 1 : 0,
        closed_at: closed.toISOString(),
      };
      rows.push(row);
      if (menu?.length && status !== "left" && rnd() < (status === "seated" ? 0.32 : 0.15)) {
        const lines = [...menu].sort(() => rnd() - 0.5).slice(0, 1 + Math.floor(rnd() * 2)).map((m) => ({
          id: m.id, qty: 1 + Math.floor(rnd() * 2), nameEn: m.name_en, nameAr: m.name_ar, nameUr: m.name_ur, price: Number(m.price),
        }));
        orderPlans.push({ ticket: row.ticket_number, lines, created: joined.toISOString() });
      }
    }
  }
  const ids = new Map();
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await db.from("entries").insert(rows.slice(i, i + 500)).select("id, ticket_number");
    if (error) die("Could not add past visits:", error);
    data.forEach((e) => ids.set(e.ticket_number, e.id));
  }
  const { error: oCheck } = await db.from("orders").select("id").limit(1);
  if (!oCheck && orderPlans.length) {
    const orders = orderPlans.map((o) => ({
      restaurant_id: restaurantId,
      entry_id: ids.get(o.ticket),
      status: "accepted",
      items: o.lines,
      total: o.lines.reduce((s, l) => s + l.qty * l.price, 0),
      created_at: o.created,
      updated_at: o.created,
    }));
    for (let i = 0; i < orders.length; i += 500) {
      const { error } = await db.from("orders").insert(orders.slice(i, i + 500));
      if (error) die("Could not add past pre-orders:", error);
    }
  }
  console.log(`Added ${rows.length} past visits and ${orderPlans.length} pre-orders for the Reports page.`);
}

// 6. Tables T1 to T6 and a live floor: one table of each state, so Floor and Kitchen have something to show.
const tableDefs = [
  { n: "T1", cap: 2, sec: "main", staff: "Omar" },
  { n: "T2", cap: 4, sec: "main", staff: "Omar" },
  { n: "T3", cap: 6, sec: "family", staff: "Ayesha" },
  { n: "T4", cap: 4, sec: "family", staff: "Ayesha" },
  { n: "T5", cap: 4, sec: "patio", staff: "Bilal" },
  { n: "T6", cap: 2, sec: "patio", staff: "Bilal" },
];
const { data: tables, error: tErr } = await db
  .from("restaurant_tables")
  .insert(tableDefs.map((t, i) => ({ restaurant_id: restaurantId, table_number: t.n, capacity: t.cap, section_id: t.sec, assigned_staff_name: t.staff, sort: i })))
  .select("id, table_number, qr_secret");
if (tErr) die("Could not add tables (is migration 0006 run?):", tErr);
const T = (n) => tables.find((t) => t.table_number === n);
const open = async (n, minsAgo) => {
  const { data, error } = await db.rpc("tp_scan_table", { p_table_id: T(n).id, p_secret: T(n).qr_secret }).single();
  if (error) die(`Could not open ${n}:`, error);
  await db.from("table_sessions").update({ opened_at: new Date(Date.now() - minsAgo * 60_000).toISOString() }).eq("id", data.id);
  return data.id;
};
const order = async (session, items, note = "") => {
  const { data, error } = await db.rpc("tp_session_order", { p_session_id: session, p_items: items, p_note: note }).single();
  if (error) die("Could not add a table order:", error);
  return data.id;
};
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();
const stage = (id, patch) => db.from("orders").update(patch).eq("id", id);

// T1: just ordered, waiting for staff to approve.
const s1 = await open("T1", 6);
await order(s1, [{ id: D("Chicken Tikka"), qty: 1, portion: "half", spice: "medium" }, { id: D("Garlic Naan"), qty: 2 }, { id: D("Mint Lemonade"), qty: 2 }]);
// T2: eating (served).
const s2 = await open("T2", 38);
const o2 = await order(s2, [{ id: D("Mutton Karahi"), qty: 1, portion: "half", spice: "hot" }, { id: D("Garlic Naan"), qty: 3 }, { id: D("Sweet Lassi"), qty: 2 }]);
await stage(o2, { status: "accepted", accepted_at: ago(30), ready_at: ago(14), served_at: ago(12) });
// T3: asked for the bill (10% tip, split 3 ways, Easypaisa), with a loyalty number.
const s3 = await open("T3", 64);
const o3 = await order(s3, [{ id: D("Family Feast Deal"), qty: 1 }, { id: D("Cardamom Pistachio Kunafa"), qty: 2 }]);
await stage(o3, { status: "accepted", accepted_at: ago(55), ready_at: ago(35), served_at: ago(33) });
{
  const { data: b, error } = await db.rpc("tp_request_bill", { p_session_id: s3, p_entry_id: null, p_tip_pct: 10, p_split: 3, p_method: "easypaisa" }).single();
  if (error) die("Could not add the demo bill (is migration 0008 run?):", error);
  await db.from("bills").update({ loyalty_phone: "923000000101" }).eq("id", b.id);
}
// T4: cooking, tandoor done but curry still going, and the guest called for help.
const s4 = await open("T4", 22);
const o4 = await order(s4, [{ id: D("Saffron Charcoal Lamb Chops"), qty: 1, spice: "mild" }, { id: D("Ember Butter Chicken"), qty: 1, portion: "full" }, { id: D("Garlic Naan"), qty: 2 }]);
await stage(o4, { status: "accepted", accepted_at: ago(16), station_ready: { tandoor: ago(3) } });
await db.from("service_alerts").insert({ restaurant_id: restaurantId, table_id: T("T4").id, session_id: s4, alert_type: "help", created_at: ago(1) });
// T5: the demo guest table (the "Table 5" link joins this party). One round cooking.
const s5 = await open("T5", 12);
const o5 = await order(s5, [{ id: D("Chicken Tikka"), qty: 1, portion: "full", spice: "hot" }, { id: D("Lahori Chana"), qty: 1, spice: "mild" }, { id: D("Kashmiri Chai"), qty: 2 }]);
await stage(o5, { status: "accepted", accepted_at: ago(8), station_ready: { drinks: ago(2) } });
// T6: free.

// 7. Loyalty: stamp card (8 stamps), two rewards, three members.
await db.from("loyalty_members").delete().eq("restaurant_id", restaurantId);
await db.from("loyalty_rewards").delete().eq("restaurant_id", restaurantId);
{
  const { error } = await db.from("loyalty_rewards").insert([
    { restaurant_id: restaurantId, kind: "stamps", name_en: "Free kunafa", name_ar: "كنافة مجانية", name_ur: "مفت کنافہ", cost: 8, sort: 0 },
    { restaurant_id: restaurantId, kind: "stamps", name_en: "Free Kashmiri chai for the table", name_ar: "شاي كشميري مجاني للطاولة", name_ur: "پوری میز کے لیے مفت کشمیری چائے", cost: 8, sort: 1 },
  ]);
  if (error) die("Could not add loyalty rewards (is migration 0009 run?):", error);
  // Made-up numbers in an unused range; not real people.
  await db.from("loyalty_members").insert([
    { restaurant_id: restaurantId, phone: "923000000101", name: "Tariq", stamps: 7, visits: 7, last_visit_at: ago(60 * 24 * 3) },
    { restaurant_id: restaurantId, phone: "923000000102", name: "Hina", stamps: 3, visits: 3, last_visit_at: ago(60 * 24 * 8) },
    { restaurant_id: restaurantId, phone: "923000000103", name: "Usman", stamps: 9, visits: 17, last_visit_at: ago(60 * 24 * 1) },
  ]);
}

// 8. Trivia: three of the restaurant's own questions on top of the built-in pack.
await db.from("trivia_questions").delete().eq("restaurant_id", restaurantId);
{
  const o = (en, ar, ur) => ({ en, ar, ur });
  const { error } = await db.from("trivia_questions").insert([
    {
      restaurant_id: restaurantId, category: "house", correct: 0,
      q_en: "Which station cooks our lamb chops?", q_ar: "في أي قسم تُطهى ريش الغنم لدينا؟", q_ur: "ہماری لیمب چوپس کس اسٹیشن پر بنتی ہیں؟",
      options: [o("Tandoor", "التنور", "تنور"), o("Curry", "الكاري", "سالن"), o("Drinks", "المشروبات", "مشروبات"), o("Desserts", "الحلويات", "میٹھا")],
    },
    {
      restaurant_id: restaurantId, category: "house", correct: 2,
      q_en: "What colour is Kashmiri chai?", q_ar: "ما لون الشاي الكشميري؟", q_ur: "کشمیری چائے کا رنگ کیا ہوتا ہے؟",
      options: [o("Green", "أخضر", "سبز"), o("Black", "أسود", "کالا"), o("Pink", "وردي", "گلابی"), o("Yellow", "أصفر", "پیلا")],
    },
    {
      restaurant_id: restaurantId, category: "house", correct: 1,
      q_en: "How many stamps fill a Zaffran & Ember loyalty card?", q_ar: "كم ختمًا يملأ بطاقة ولاء زعفران وإمبر؟", q_ur: "زعفران اینڈ ایمبر کا لائلٹی کارڈ کتنے اسٹیمپ سے بھرتا ہے؟",
      options: [o("5", "5", "5"), o("8", "8", "8"), o("10", "10", "10"), o("12", "12", "12")],
    },
  ]);
  if (error) die("Could not add trivia questions (is migration 0010 run?):", error);
}

console.log("Demo ready.");
console.log(`  Host login: ${EMAIL} / ${PASSWORD}`);
console.log(`  Guest page: /r/${SLUG}  (with SHOW_DEMO_LOGIN=1 it shows the Table 5, Floor and Kitchen demo links)`);
