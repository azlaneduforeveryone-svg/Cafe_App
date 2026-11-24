# Supabase migration: steps to finish

This branch moves TablePulse from a local JSON file to Supabase:

- **Database:** Postgres tables `restaurants`, `staff`, `entries` (`supabase/migrations/0001_tablepulse.sql`)
- **Login:** Supabase Auth with `@supabase/ssr` (email + password, email confirmation, password reset)
- **Live updates:** Supabase Realtime broadcast "pings" (no data in the ping; screens reload their own snapshot from the API)

The code builds, lints and type-checks. The SQL was tested on Postgres (PGlite) with 19 checks. It has **not** been run against the real Supabase project yet. Steps 1 to 6 below do that.

Do the steps in order.

---

## 1. Delete the old storage files

These files belong to the old JSON storage. The build fails while they exist:

```
lib/db.ts
lib/seed.ts
lib/session.ts
lib/password.ts
lib/events.ts
app/api/host/stream/            (whole folder)
app/api/ticket/[token]/stream/  (whole folder)
.data/                          (old local database file, not needed any more)
```

## 2. Create the database

Supabase dashboard > **SQL Editor** > New query > paste the whole file `supabase/migrations/0001_tablepulse.sql` > **Run**.

It's safe to run again. Check: **Table Editor** shows `restaurants`, `staff`, `entries`, each with "RLS enabled". There are no policies, and that's intended: the public key must not read anything.

## 3. Supabase Auth settings

Dashboard > **Authentication** > **URL Configuration**:

- **Site URL:** `https://cafeapp-pi.vercel.app`
- **Redirect URLs** (add both):
  - `https://cafeapp-pi.vercel.app/**`
  - `http://localhost:3000/**`

Dashboard > **Authentication** > **Email Templates** (recommended, so links work when opened on a different device than the one used to sign up):

- **Confirm signup**, replace the link with:
  `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Confirm your email</a>`
- **Reset password**, replace the link with:
  `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">Reset your password</a>`

(`RedirectTo` already contains `?next=...`, which is why the template starts with `&`.)

**Note:** Supabase only allows editing templates after custom SMTP is set up. Until then, skip this: the default templates work. The email is confirmed as soon as the link is clicked; the link only logs the person in automatically when opened in the same browser they signed up in. Otherwise they land on the login page with a message telling them to log in.

**Email sending:** Supabase's built-in sender is rate-limited to a few emails per hour, which is fine for testing. Before real customers sign up, add your own SMTP provider under **Authentication > Emails > SMTP Settings** (for example Resend, Brevo or Amazon SES).

## 4. Realtime

Dashboard > **Realtime** > **Settings**: make sure public channels are allowed. The "Allow public access" toggle must be on; don't enable "private channels only". The app uses public channels named `tp:<restaurant id>` that carry only an empty "change" ping.

## 5. Environment variables

**Vercel** (Project > Settings > Environment Variables). The Supabase integration already added what's needed:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (the legacy `..._ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` also work as fallbacks).

Remove these two. They belonged to the old storage and are no longer used:
- `TABLEPULSE_DATA_DIR`
- `SESSION_SECRET`

Optional:
- `SHOW_DEMO_LOGIN=1` shows the demo host login on the home and login pages. Anyone could then log in as the demo host, so leave it off for real customers.
- `ALLOW_TEST_UPGRADE=1` shows the "Activate Pro (test mode)" button in production.

**Local:** `.env.local` was already pulled with `vercel env pull`. No changes are needed.

Rule: no secret key may ever start with `NEXT_PUBLIC_`.

## 6. Run locally and test

```
npm install
npm run dev
```

Optional demo restaurant (creates the login `demo@tablepulse.app` / `demo1234` and three waiting guests; run again any time to reset it):

```
node --env-file=.env.local scripts/seed-demo.mjs
```

Test checklist (use two browser windows, or a laptop and a phone with `npm run dev:lan`):

- [ ] Sign up a new restaurant > "Check your email" appears > open the link > lands on `/dashboard`
- [ ] Log out, log in again
- [ ] Wrong password shows "Email or password is incorrect"
- [ ] Forgot password > email > link > set new password > lands on `/dashboard`
- [ ] Open the guest page (`/r/<slug>` from Settings), join the line > host tablet shows the guest **within about a second, without refresh**
- [ ] Host taps **Notify** > guest screen turns green and chimes; host sees the countdown
- [ ] Guest taps "We're on our way" > host sees the badge
- [ ] **Seated** / **No-show** remove the guest on both screens
- [ ] Demo restaurant: the 3rd Notify shows the "free alerts used up" box
- [ ] Settings: rename a section, save, the guest page shows the new name
- [ ] Supabase Table Editor shows the rows

If the host screen only updates every 20 seconds instead of instantly, Realtime pings are failing (step 4). Check the server log for `[tablepulse] live update failed`.

## 7. Deploy

Commit and push to `main`. Vercel builds automatically. Repeat the checklist on `https://cafeapp-pi.vercel.app`.

---

## How it fits together

| Piece | File |
| --- | --- |
| Tables, locked access, single-step functions (`tp_create_restaurant`, `tp_join`, `tp_notify`) | `supabase/migrations/0001_tablepulse.sql` |
| Server client as the logged-in user (cookies) | `lib/supabase/server.ts` |
| Server client with full access (secret key, server only) | `lib/supabase/admin.ts` |
| Browser client (only listens for pings) | `lib/supabase/browser.ts` |
| Keeps logins fresh on each staff request | `proxy.ts` |
| Who is logged in, and their restaurant | `lib/auth.ts` |
| All waitlist reads and writes | `lib/queue.ts` |
| Sends the "change" ping after each write | `lib/realtime.ts` |
| Screens: listen for pings, reload snapshot, poll every 20 s as backup | `components/useLive.ts` |
| Email links (confirm, reset) | `app/auth/confirm/route.ts` |
| Demo data | `scripts/seed-demo.mjs` |

**Security model:** guests never log in. Their ticket link has a 32-character random token, and only the app's server reads the database. The public key can't read any table or call any function. Realtime pings carry no guest data.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Missing NEXT_PUBLIC_SUPABASE_URL...` | `.env.local` missing locally, or the variable isn't set for that Vercel environment |
| `Could not find the function public.tp_join` | Step 2 not done (SQL not run) |
| Sign up says "Something went wrong" | Check server log; often SMTP/rate limit, or step 2 not done |
| Email link goes to `/login?error=link` | Redirect URL not in the allow list (step 3), or the link expired / was already used |
| Logged in but `/dashboard` sends you to `/login` | That user has no row in `staff` (signed up before step 2). Delete the user in Supabase Auth and sign up again |
| Host updates only every 20 s | Realtime public channels disabled (step 4) |

---

## Menu, deals, pre-orders and logos (added later)

1. Supabase > **SQL Editor** > run `supabase/migrations/0002_menu_orders.sql` (safe to re-run). It adds the menu tables, the pre-order table and function, the logo column, and a public image bucket called `restaurant-media` (2 MB limit, images only).
2. Check: **Storage** shows the `restaurant-media` bucket marked Public. **Table Editor** shows `menu_categories`, `menu_items`, `orders` with RLS enabled.
3. Optional: re-run `node --env-file=.env.local scripts/seed-demo.mjs` to give the demo restaurant a sample menu (one deal, three dishes).

Test checklist:
- [ ] Settings: upload a logo > it shows on the guest join and ticket pages; Remove works
- [ ] Menu: add a category in all three languages; leaving Arabic or Urdu empty is refused
- [ ] Menu: add a dish with a phone photo (it uploads quickly, the browser shrinks it), price, and a deal with an original price higher than the price
- [ ] Menu: Hide a dish > it disappears from the guest menu; Show brings it back
- [ ] Guest ticket: "View menu and pre-order" > deals first > add items > Review > Send
- [ ] Host queue shows the pre-order on that guest's row within about a second; Accept locks it (guest can no longer edit)
- [ ] Guest edits a not-yet-accepted order > host sees the update; guest cancels > it disappears
- [ ] Mark a guest with a submitted (not accepted) pre-order as No-show > the order is cancelled
- [ ] Guest menu in Arabic and Urdu shows the right names and reads right to left

---

## Reports and alerts (added later)

1. Supabase > **SQL Editor** > run `supabase/migrations/0003_reports.sql` (safe to re-run, read-only: one index and one report function).
2. Optional, for demos: re-run `node --env-file=.env.local scripts/seed-demo.mjs`. It now also adds five weeks of made-up past visits and pre-orders to the demo restaurant so the Reports page has numbers. It only touches the demo restaurant.

How the numbers are counted:
- A business day runs from 4:00 AM to 3:59 AM local time (Saudi Arabia UTC+3, Pakistan UTC+5), so late-night parties count on the evening they arrived.
- Wait time = joining the line to being called (Notify), for seated parties only.
- Pre-order sales = accepted pre-orders of guests who were seated. Accepted orders of guests who left or didn't show are shown separately as "not collected".
- Pre-order totals are not tax invoices. The restaurant's POS stays the source for official sales and VAT.
- Alerts compare the last 7 full days with the 28 days before, and stay quiet until there are at least 20 parties a week.
- The report data holds totals only (no guest names or phones), so it can later be sent to an AI summary safely.

Test checklist:
- [ ] Top bar shows **Reports**; the page opens on "Last 7 days"
- [ ] With the demo data: the KPI cards, parties-per-day chart, busy-times grid and top dishes all show numbers
- [ ] Switch to 30 days, This month, Last month, and a custom From/To range
- [ ] **Daily CSV** and **Dishes CSV** download and open in Excel with Arabic and Urdu dish names readable
- [ ] Switch the host language to Arabic and Urdu: the page reads right to left
- [ ] A new restaurant with no visits shows "Not enough data yet" and "No parties in this period yet", with no errors

---

## Sold out, meal times and ordering at the table (added later)

1. Supabase > **SQL Editor** > run `supabase/migrations/0005_menu_schedule_table_orders.sql` (safe to re-run). Don't re-run `0002` after this one: 0005 replaces its order function.
2. Optional test restaurant: `node --env-file=.env.local scripts/seed-qalandari.mjs`. It creates "Qalandari Food Truck (test)" (Saudi, SAR) with 6 dishes and prints a login with a new random password. Only the daal chawal prices are real; the others say "sample price". Keep it for internal testing.

What it does:
- **Sold out**: on the Menu page, the box icon on a dish marks it sold out **until tomorrow** (back by itself at 4 AM) or **until you turn it back on**. Guests still see it, greyed out with "Sold out", and can't order it.
- **Meal times**: at the top of the Menu page, add Breakfast / Lunch / Dinner (or your own) with their times. Dinner can run past midnight (18:00 to 01:00).
- **When it's served**: in a dish's edit window, pick days and meal times. The calendar icon next to a category does the same for the whole category. Outside those times the dish is hidden from guests and the server refuses orders for it.
- **Ordering at the table**: after the host taps Seat, the guest's ticket page turns into "Order at your table". Each order the restaurant accepts is a round (Order 1, Order 2...). While a round waits for the restaurant, sending again updates it instead of adding a new one.
- **Tables tab** on the host queue page: seated guests, their pre-order and rounds, table number box, Accept / Cancel, and **Close table**. A new table order makes a chime and a red count on the tab. A table closes by itself 6 hours after seating.
- Reports now count every accepted app order (pre-order and table rounds) of seated guests, labelled "App orders".

Test checklist:
- [ ] Menu page: add the three preset meal times, save; set a dish to Lunch only: outside lunch it disappears from the guest menu and shows "Not on now" in the editor
- [ ] Set a category to Fri, Sat only: its dishes vanish from the guest menu on other days
- [ ] Mark a dish sold out "until tomorrow": guest sees it greyed with "Sold out"; editor shows "back" time; **Back in stock** restores it
- [ ] Guest joins, is seated: ticket shows "Order at your table"; order 2 dishes; host Tables tab chimes, shows "New order"; Accept
- [ ] Guest orders again: shows as Order 2; while not accepted, editing it updates the same round; guest can cancel it
- [ ] Host enters a table number: the guest sees "Table 5"
- [ ] Host closes the table: guest sees "Thanks for visiting" and can't order
- [ ] A guest who still had a sold-out dish in the cart gets "no longer available" and the menu reloads
- [ ] Guest and host screens in Arabic and Urdu read right to left

---

## Tables, table QR codes, floor map and call waiter (added later)

1. Supabase > **SQL Editor** > run `supabase/migrations/0006_tables_sessions_alerts.sql` (safe to re-run).
2. Host top bar > **Floor** > **Manage tables**: add your tables (e.g. T1 to T6), seats, section and waiter.
3. **Print QR** prints one card per table. Each code only works for its own table.
4. Add the guest **Wi-Fi** name and password on the Floor page (optional).

How it stays private and safe:
- The database is still reachable only by the app's server. Guests never get database access.
- A table QR contains a secret for that table. Scanning it gives the phone a session key in a hidden (httpOnly) cookie and then a clean address, so a photo of a guest's screen is useless.
- Everyone at the same table who scans joins the same session, and only sees that table's orders.
- Every order from a table waits on the Floor page under **Waiting for approval** until staff tap **Send to kitchen**. Someone ordering from outside with a photo of the QR is caught there.
- **Close table** ends the session: those phones lose access at once. Sessions also end by themselves after 8 hours.
- **New QR code** (the refresh icon in Manage tables) invalidates a printed code if it's copied or stolen.
- Each call button (Water, Napkins, Bill, Call waiter) can be open only once per table until staff resolve it, so nobody can spam the floor.

Test checklist:
- [ ] Add T1 to T6; Print QR shows six cards
- [ ] Scan T5's code with a phone: it opens "Table T5" and the address bar shows no secret
- [ ] Open the same page address on another phone without scanning: it says "Scan the QR code on your table" and shows no orders
- [ ] Order from T5: it appears under Waiting for approval with a chime; **Send to kitchen** turns it green on the phone
- [ ] Second phone scans T5: sees the same orders and can add more
- [ ] Phone taps Call waiter > Water: red pulsing "T5 Water" with a running timer on the Floor page; **Resolve** clears it; tapping Water twice before resolving creates only one call
- [ ] Seat a waiting party (with a pre-order) on T2 from the Floor page: the pre-order shows on T2, and the guest's ticket page shows the table
- [ ] **Close table** on T5: the phone switches to "Thanks for visiting" and can't order
- [ ] **New QR code** on T5, then scan the old printed code: "This QR code isn't valid"
- [ ] Floor page and guest table page in Arabic and Urdu read right to left

---

## Fonts, dish options and the kitchen display (added later)

1. Supabase > **SQL Editor** > run `supabase/migrations/0007_dish_options_kitchen.sql` (safe to re-run).
2. Fonts are now bundled in `app/fonts/` (Open Font License, see `app/fonts/LICENSE.md`): Plus Jakarta Sans and Playfair Display for English, IBM Plex Sans Arabic and Amiri for Arabic, Gulzar and Noto Nastaliq Urdu for Urdu. No font requests go to Google any more.

What it does:
- **Kitchen stations** (Menu page): e.g. Tandoor, Curry, Drinks. Each dish picks a station.
- **Dish options** (dish edit window > Options): allergens, which spice levels the guest may choose (Mild / Medium / Hot), sizes with their own prices (one tap for Half / Full), and a "Make it a combo" dish offered with it.
- **Guest menu**: search bar, category tabs, and a slide-up window per dish with allergens, size, spice, combo and quantity. The server prices every size; a phone can't change a price.
- **Kitchen display** (`Kitchen` in the top bar): dark screen, one column per station. Each ticket shows table (or ticket number for a pre-order), dishes, size and spice, the note and a timer that turns amber after 10 minutes and red after 18. **Mark ready** finishes that station's part; when every station is done the order is Ready.
- **Ready and served**: a ready order shows green "Ready to serve" on the Floor table card with a chime; staff tap it when served. The guest's phone shows a progress ring: Ordered > Cooking > Ready > Served.

Test checklist:
- [ ] Menu page: add Tandoor, Curry, Drinks; give Butter Chicken station Curry, allergens Dairy and Nuts, spice levels Mild/Medium/Hot, sizes Half 18 / Full 32, combo Garlic Naan
- [ ] Guest table phone: search "naan" finds Garlic Naan; tabs filter; Butter Chicken opens the window with allergens, sizes, spice and combo; Half + Hot + combo adds two lines with the right prices
- [ ] Send the order; Floor > Send to kitchen; Kitchen shows Butter Chicken under Curry (Half, Hot) and Naan under Tandoor, with the timer running
- [ ] Mark ready on Curry only: order stays on the kitchen screen under Tandoor; Mark ready on Tandoor: it leaves the screen
- [ ] Guest ring moves Ordered > Cooking > Ready; Floor shows "Ready to serve" with a chime; tapping it moves the guest to Served
- [ ] Arabic and Urdu: headings use Amiri / Nastaliq, Urdu text isn't clipped, prices stay in Latin digits

---

## Bill, split, tip, payment method, receipt and rating (migration 0008)

**Run:** SQL Editor > paste `supabase/migrations/0008_bills_ratings.sql` > Run. Safe to re-run. Needs 0007 first.

What it adds:
- `bills` (one per table session, or per seated waitlist ticket with no table) and `ratings` (one per paid bill, 1 to 5 stars, comment up to 300 characters). RLS on, no policies, server key only.
- `restaurants.next_receipt`: receipt numbers per restaurant, starting at 1.
- `tp_request_bill`: guest asks for the bill. Subtotal comes only from orders the restaurant approved; tip capped at 30%, split 1 to 20, method from a fixed list. Sends a "bill" call to the floor.
- `tp_mark_paid`: staff confirm payment (works without a guest request). Gives the next receipt number, freezes the lines, cancels rounds still waiting for approval, resolves the bill call. Tapping twice changes nothing.
- Trigger `orders_block_after_paid`: once paid, no new round, no edit to a waiting round and no late approval can be added to that bill.

TablePulse records how the guest pays; it does not take payment. Receipts say "Not a tax invoice".

### Checklist
- [ ] Migration ran with no error; `select count(*) from bills;` returns 0.
- [ ] Guest at a table with an approved order sees "Your bill so far". Get the bill > tip 10% > split 3 > mada > Ask. Floor card turns amber with total, method and per-person amount.
- [ ] Guest can change tip or split before paying; the floor updates.
- [ ] Floor: Mark paid > method > Payment received. Card shows "Paid #1". Guest phone shows the receipt and stars.
- [ ] After paid, the guest's "Order from the menu" button is gone and a new order is refused.
- [ ] Close the table: the guest phone still shows the receipt and can rate (for 6 hours).
- [ ] Rating shows on the paid strip and in "Rating today" on the floor.
- [ ] Waitlist Tables tab: seated ticket with approved food has Mark paid; ticket page shows bill and receipt.
- [ ] PK restaurant shows Cash, Card, JazzCash, Easypaisa, Raast; SA shows Cash, Card, mada, Apple Pay, STC Pay, Google Pay.

---

## Loyalty: stamps or points by phone, confirmed by staff (migration 0009)

**Run:** SQL Editor > paste `supabase/migrations/0009_loyalty.sql` > Run. Safe to re-run. Needs 0008 first.

What it adds:
- Restaurant settings: `loyalty_mode` (off, stamps, points), `stamps_needed` (3 to 20), `stamp_min_spend`, `spend_per_point`. Loyalty is Pro only (trial counts).
- `loyalty_members` (one per phone per restaurant), `loyalty_rewards`, `loyalty_events` (earn and redeem history). RLS on, no policies, server key only.
- `tp_norm_phone`: accepts 05.. / +966 for SA, 03.. / +92 for PK, other countries with +; Arabic and Urdu digits work.
- `tp_loyalty_earn`: runs only after staff mark a bill paid. One earn per bill, max 3 per member in 24 hours. Stamps: 1 per bill at or above the minimum. Points: subtotal / spend per point (tip not counted).
- `tp_loyalty_redeem`: staff only, checks the balance, logs the reward.

Why staff confirm: anyone can type a number. Guests never look up a balance by number; they only see it on their own paid receipt. Staff see the member's name before giving a reward.

### Checklist
- [ ] Migration ran with no error.
- [ ] Dashboard > Loyalty: choose Stamp card, 8 stamps, minimum 30, Save. Add reward "Free kunafa" in 3 languages.
- [ ] Guest at a table: Get the bill shows "Collect a stamp every visit. 8 stamps = Free kunafa" and a mobile field. Enter 05XXXXXXXX and ask for the bill.
- [ ] Floor: Mark paid shows "Guest's number: ••XXXX". After Payment received, the guest receipt shows "+1 stamp" and the stamp card.
- [ ] Same number on a 4th paid bill within 24 hours: payment works, toast says the loyalty limit was reached.
- [ ] With 8+ stamps, Mark paid offers "Free kunafa (8)". Choose it: balance drops by 8, Loyalty page shows "Rewards (24h): 1".
- [ ] Switch to Points (spend per point 10): a SAR 55 bill gives 5 points.
- [ ] Members list shows full numbers to the owner only; delete a member removes them.
- [ ] Free restaurant (no trial): Loyalty page shows the Pro notice and nothing is earned.
- [ ] A bad number (e.g. 12345) on the bill sheet shows "That mobile number doesn't look right."

---

## Table trivia (migration 0010)

**Run:** SQL Editor > paste `supabase/migrations/0010_trivia.sql` > Run. Safe to re-run (the built-in questions update in place). Needs 0009 first.

What it adds:
- `restaurants.trivia_on` (default on). `trivia_questions` with 38 built-in questions in EN/AR/UR (food, geography, science, general; no religion or politics) plus each restaurant's own questions. `trivia_players`, `trivia_games`, `trivia_answers`. RLS on, no policies, server key only.
- `tp_trivia_join`: nickname per table (1 to 16 characters, unique at the table, max 8 players). The player token is kept in an httpOnly cookie.
- `tp_trivia_start`: 8 questions (the table's unseen ones first, the restaurant's own questions preferred), 5 s countdown, max 12 games per table session.
- `tp_trivia_answer`: the server decides which question is open (15 s to answer, then 5 s showing the answer). Right = 500 plus up to 500 for speed; wrong or late = 0. One answer per question.

Anti-cheat: phones never receive the correct answer while a question is open; scores only include closed questions; answer order is shuffled per game. Privacy: nicknames are visible only to the same table; "Top tables today" shows table labels and scores only. No prizes are tied to trivia.

### Checklist
- [ ] Migration ran with no error; `select count(*) from trivia_questions where restaurant_id is null;` returns 38.
- [ ] Guest at a table sees "Play trivia while you wait" under the menu button.
- [ ] Two phones on the same table QR: both join with different nicknames; the same nickname twice is refused.
- [ ] One phone taps Start game: both phones show the countdown, then the same question at the same time.
- [ ] Answer on one phone: it shows "Locked in. 1 of 2 answered." The other phone does not see the correct answer until the timer ends.
- [ ] After 15 s both phones show the right answer in green, the points, and the scores.
- [ ] After 8 questions: winner screen, Play again works, and the next game has different questions.
- [ ] A phone on a different table sees the first table on "Top tables today" by label and score, with no nicknames.
- [ ] Dashboard > Trivia: add a question about the restaurant; it appears in the next game, with its answers in a shuffled order.
- [ ] Turn Trivia off: the guest button disappears and the API refuses to join.
- [ ] Close the table: the trivia screen says the table is closed.
