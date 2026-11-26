# Table & Bell

QR waitlist and digital buzzer for restaurants. English, Arabic and Urdu with full right-to-left support. Same look as the Gemini demo, but every screen is real: logins, saved data and live sync between the host tablet and guest phones.

## Run it on your computer

Needs Node.js 20.9 or newer and a Supabase project. First-time setup (database, auth settings, keys) is in **SUPABASE_SETUP.md**.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign up, or create the demo restaurant:

```bash
node --env-file=.env.local scripts/seed-demo.mjs
```

| What | Where |
| --- | --- |
| Demo host login | `demo@tableandbell.com`, password from `DEMO_PASSWORD` (shared privately) |
| Host tablet | `/dashboard` |
| Guest page (the QR code points here) | `/r/zaffran-ember` |
| Settings and printable QR | `/dashboard/settings` |
| Plans | `/pricing` |

### Test with a real phone

1. Run `npm run dev:lan`.
2. Find your PC's network address (Windows: `ipconfig`, IPv4, for example 192.168.1.20).
3. On the PC open `http://192.168.1.20:3000/login`. The QR code in Settings now points to that address.
4. Scan it with a phone on the same Wi-Fi, join, then tap Notify on the PC.

## What works now

- Supabase Auth: sign up with email confirmation, login, logout, forgot and reset password
- Supabase Postgres storage, with Row Level Security locking out the public key
- Live sync via Supabase Realtime pings, with a 20-second backup check
- Host dashboard: Notify, Buzz again, Seated, No-show, walk-ins
- Guest join page and live ticket: chime, Android vibration, screen wake lock, "We're on our way"
- Free plan metering (150 alerts a month), enforced inside the database so two taps can't go over
- Each guest picks their own language; the host keeps theirs
- Menu with photos, categories and deals (all text in English, Arabic and Urdu), editable at `/dashboard/menu`
- Guest pre-orders from the live ticket; host accepts on the queue screen (pay at the restaurant)
- Restaurant logo upload (Settings), shown on guest screens
- Region pricing (SAR / PKR) in `lib/pricing.ts`

## Not built yet

1. **Payments** (Moyasar / Tap / HyperPay for Saudi Arabia; Raast / JazzCash / EasyPaisa gateway for Pakistan). The gateway webhook replaces `app/api/host/plan/route.ts`.
2. **WhatsApp alerts** through Meta's WhatsApp Cloud API. Guest phone numbers are already collected.
3. Staff invites (more than one login per restaurant), history and reports.
4. Own SMTP provider for auth emails (see SUPABASE_SETUP.md step 3).

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
lib/supabase/                 Supabase clients (server, admin, browser)
lib/realtime.ts               Live update pings
supabase/migrations/          Database tables and functions
lib/pricing.ts                Prices and payment methods per country
```
