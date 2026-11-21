# TablePulse

QR waitlist and digital buzzer for restaurants. English, Arabic and Urdu with full right-to-left support. Same look as the Gemini demo, but every screen is real: logins, saved data and live sync between the host tablet and guest phones.

## Run it on your computer

Needs Node.js 20.9 or newer (check with `node -v`).

```bash
npm install
npm run dev
```

Open http://localhost:3000

A demo restaurant is created on first run:

| What | Where |
| --- | --- |
| Host login | `demo@tablepulse.app` / `demo1234` at `/login` |
| Host tablet | `/dashboard` |
| Guest page (the QR code points here) | `/r/zaffran-ember` |
| Settings and printable QR | `/dashboard/settings` |
| Plans | `/pricing` |

The demo starts with 148 of 150 free alerts used, so the third Notify shows the upgrade prompt. On the Plans page, "Activate Pro (test mode)" switches the plan for testing.

### Test with a real phone

1. Run `npm run dev:lan` instead of `npm run dev`.
2. Find your PC's network address (Windows: run `ipconfig`, look for IPv4, for example 192.168.1.20).
3. On the PC, open `http://192.168.1.20:3000/login` and log in. The QR code in Settings now points to that address.
4. Scan it with a phone on the same Wi-Fi, join the line, then tap Notify on the PC. The phone chimes and turns green.

If Windows Firewall asks about Node.js, allow it on private networks.

## What works now

- Owner sign up and login (one restaurant per account), password hashing, 30-day session
- Host dashboard: live queue, Notify, Buzz again, Seated, No-show, walk-ins with guest language and phone
- Live sync with Server-Sent Events: no refresh on either side, reconnects by itself
- Guest join page and live ticket: place in line, wait estimate, chime, Android vibration, screen wake lock, browser notification, "We're on our way", leave line
- 5-minute (configurable) claim countdown on both screens, "Time up" flag for the host
- Each guest picks their own language; the host keeps theirs
- Free plan metering: 150 alerts per calendar month, only the first buzz per party counts
- Real stats: seated today, no-shows today, average wait from parties actually seated
- Settings: restaurant name in 3 languages, seating sections, claim time, minutes per party
- Printable QR card
- Region pricing: SAR for Saudi Arabia, PKR for Pakistan (placeholder prices in `lib/pricing.ts`)

## Not built yet (next steps, in order)

1. **Hosted database.** Data is stored in `.data/db.json` on the machine running the app. That's fine for testing or one restaurant on one server. Before selling to many restaurants, move to Supabase or Postgres. All storage goes through `lib/db.ts` and `lib/queue.ts`, so only those files change. Live sync then needs Supabase Realtime or Redis instead of the in-memory event bus in `lib/events.ts`.
2. **Payments.** Saudi Arabia: Moyasar, Tap or HyperPay (mada, Apple Pay, cards). Pakistan: a gateway with Raast, JazzCash, EasyPaisa and cards. Both need a registered business. The gateway's webhook replaces `app/api/host/plan/route.ts`.
3. **WhatsApp alerts** through Meta's WhatsApp Cloud API. Guest phone numbers are already collected.
4. Staff accounts (more than one login per restaurant), password reset email, history and reports.

## Hosting

Because data and live sync live inside one running server, host it on something that keeps one server running, such as a small VPS, Railway or Render. Vercel needs step 1 first.

Set these on the server:

| Variable | Why |
| --- | --- |
| `SESSION_SECRET` | Long random text that signs login cookies. If not set, one is created in `.data/secret`. |
| `APP_URL` | Your public address, for example `https://app.tablepulse.com`, so the QR code uses it. |
| `TABLEPULSE_NO_SEED=1` | Skip creating the demo restaurant. Delete `.data/` first to start clean. |
| `ALLOW_TEST_UPGRADE=1` | Allow the test-mode Pro switch in production. Leave unset for real customers. |

## Project map

```
app/page.tsx                  Landing page
app/login, app/signup         Owner login and sign up
app/dashboard                 Host tablet (live queue)
app/dashboard/settings        Settings and printable QR
app/pricing                   Plans by region
app/r/[slug]                  Guest join page (QR target)
app/r/[slug]/t/[token]        Guest live ticket
app/api/...                   JSON and live-stream endpoints
components/host               Dashboard, settings form
components/guest              Join form, live ticket, phone frame
lib/queue.ts                  All waitlist rules (join, notify, limits, estimates)
lib/i18n.ts                   Every on-screen text in en / ar / ur
lib/db.ts                     Storage (JSON file)
lib/events.ts                 Live updates (Server-Sent Events)
lib/pricing.ts                Prices and payment methods per country
```
