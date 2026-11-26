# Subscription billing: setup and testing

What this adds:
- **14-day Pro trial** for every new restaurant (no card needed).
- **Card subscriptions through Safepay** for Pakistani restaurants: monthly automatic charges, retries by Safepay when a card fails.
- **Invoices** from your company to the restaurant, numbered `TP-2026-00001` with no gaps, printable as PDF.
- **Bank transfer payments** (Saudi restaurants for now): you record them on the admin page, the app issues the invoice and turns Pro on.
- **Admin page** at `/admin/billing`: cancellation requests, payments that need attention, manual payments, all restaurants and invoices.

How Pro is decided: a restaurant is Pro while it is paid (each payment extends Pro to the end of the paid month plus 3 days), on trial, or set to Pro by hand. If a renewal fails or the owner cancels, Pro simply ends when the paid time runs out. No scheduled jobs are needed.

Access is granted **only** from Safepay's signed webhook, never from the page Safepay sends the owner back to.

---

## Before real money: things only you can do

1. Register the company (SMC) and get its NTN. Safepay needs a registered business for a live account.
2. Apply for a Safepay merchant account (live). Sandbox works without it.
3. Ask your tax adviser two things: whether you must charge sales tax on services on the subscription (and which province's rate), and what must be printed on your invoices. Until then leave `BILLING_TAX_RATE` unset (no tax line).
4. Decide the price. It is in `lib/pricing.ts` (Pakistan PKR 6,000, Saudi Arabia SAR 79). It must match the Safepay plan amount.

---

## 1. Database

Supabase > **SQL Editor** > run `supabase/migrations/0004_billing.sql` (safe to re-run).

It adds the trial and paid-until columns, the subscriptions, invoices and webhook tables, the payment function, and updates `tp_notify` so the free alert limit applies only when a restaurant is not Pro.

Note: restaurants that already exist also get a 14-day trial from the moment you run it. The demo restaurant is put back on Free by `node --env-file=.env.local scripts/seed-demo.mjs`.

## 2. Safepay sandbox

In the Safepay **Test Dashboard** (sandbox):

1. **Subscriptions > Plans > Create plan**: amount 6,000 PKR, interval Month, interval count 1, billing cycles 0 (no end), active. Copy the plan id (`plan_...`).
   - Safepay's API takes amounts in paisa (600000 = PKR 6,000). If the dashboard asks for paisa, enter 600000.
2. **Developers > API keys**: copy the **secret key**.
3. **Developers > Endpoints > Add endpoint**:
   - URL: `https://tableandbell.com/api/webhooks/safepay` (Safepay can't reach `localhost`, so test on Vercel)
   - Events: `subscription.created`, `subscription.payment.succeeded`, `subscription.payment.failed`, `subscription.canceled`, `subscription.paused`, `subscription.resumed`, `subscription.unpaid`, `subscription.ended`, `subscription.updated`. Do **not** add `payment.succeeded`.
   - Copy the endpoint's **shared secret**.

## 3. Environment variables

Add these in Vercel (Production and Preview) and in `.env.local`. None of them may start with `NEXT_PUBLIC_`. Never paste the values into chat.

| Variable | Value |
| --- | --- |
| `SAFEPAY_ENV` | `sandbox` (later `production`) |
| `SAFEPAY_SECRET_KEY` | secret key from step 2 |
| `SAFEPAY_WEBHOOK_SECRET` | endpoint shared secret from step 2 |
| `SAFEPAY_PLAN_ID_PK` | `plan_...` from step 2 |
| `ADMIN_EMAILS` | your own login email(s), comma separated. Must be an account that has signed up in the app |
| `SALES_CONTACT` | shown to restaurants that can't pay by card, e.g. `+966 5x xxx xxxx (WhatsApp)` |
| `SELLER_NAME` | printed on invoices, e.g. your company's registered name |
| `SELLER_ADDRESS` | optional, printed on invoices |
| `SELLER_TAX_ID` | optional, NTN once you have it |
| `SELLER_EMAIL` | optional, billing contact on invoices |
| `BILLING_TAX_RATE` | optional, e.g. `16`. Leave unset until your adviser confirms. Prices are treated as tax-inclusive |
| `BILLING_TAX_LABEL` | optional, e.g. `Sales tax on services (PRA)` |

Redeploy after adding them. `/admin/billing` > **Setup** shows "Safepay: sandbox, ready" when the three Safepay values are set.

## 4. Test checklist (on the Vercel URL, sandbox)

- [ ] A new signup shows **Plan and billing > Pro free trial, ends in 14 days**, and can notify past 150 alerts
- [ ] Top bar **Plans** opens `/dashboard/billing`; a host (not owner) login sees "Only the restaurant owner can change the plan"
- [ ] Owner clicks **Subscribe with card** > lands on Safepay sandbox checkout > pays with a Safepay test card
- [ ] Back on the billing page: "Confirming your payment" then "Payment received. Pro is active" within a minute
- [ ] Billing shows Subscription: Active, renewal date, and invoice `TP-2026-00001`; **View** opens it; **Print or save as PDF** works
- [ ] `/admin/billing` > All recent webhook events shows `subscription.created` and `subscription.payment.succeeded` with result **ok**
- [ ] Subscribe button is gone while the subscription is live (no double subscription)
- [ ] Owner clicks **Cancel subscription** > confirm > message says Pro stays on until the paid date; admin page lists the request
- [ ] Cancel that subscription in the Safepay dashboard > the `subscription.canceled` webhook marks it Cancelled > click **Cancelled in Safepay** on the admin page if the webhook didn't
- [ ] Pay from a second test restaurant using a **different email** at Safepay checkout, after its checkout page has been open for more than 2 hours or while another checkout is open: the payment appears under **Payments needing attention** as unmatched. Enter that restaurant's slug and **Link**: Pro turns on and an invoice is issued
- [ ] Saudi test restaurant: billing shows **Pay by bank transfer** with your contact. On the admin page record a transfer (slug, 1 month, 79, SAR): its billing page shows Pro paid until next month and the invoice
- [ ] Billing page in Arabic and Urdu reads right to left

## 5. Questions to confirm with Safepay (their docs don't answer them)

The code handles each case safely either way, but ask Safepay support:

1. **Can we attach our own reference to a subscription checkout?** Today the app links a payment to a restaurant by Safepay's subscription id, then by the email used at checkout, then (only if exactly one checkout is open) by elimination. Anything else waits on the admin page for you to link.
2. **Can the owner's email be pre-filled on checkout?** That would make the email match almost always work.
3. **Is there an API to cancel a subscription?** If yes, the "Cancel" button can stop renewal immediately instead of you cancelling it in their dashboard.
4. **Webhook `amount` unit**: the app assumes paisa (600000 = PKR 6,000). If an invoice shows PKR 60 or PKR 600,000 after the first sandbox payment, tell me and I'll change one line.

## 6. Going live

1. Create the same plan in the **live** Safepay dashboard and a live webhook endpoint.
2. In Vercel set `SAFEPAY_ENV=production` and the live `SAFEPAY_SECRET_KEY`, `SAFEPAY_WEBHOOK_SECRET`, `SAFEPAY_PLAN_ID_PK`. The sandbox secret won't verify live webhooks, which is intended.
3. Set `SELLER_NAME`, `SELLER_TAX_ID` and, if your adviser says so, `BILLING_TAX_RATE`.
4. Make one real payment with your own card, check the invoice, then cancel it.
5. Remove `ALLOW_TEST_UPGRADE` from Vercel if it is set, so nobody can switch to Pro without paying.
