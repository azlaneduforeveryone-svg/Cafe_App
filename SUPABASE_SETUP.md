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
