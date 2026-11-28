import "server-only";
import { adminClient } from "./supabase/admin";
import { esc, sendEmail } from "./email";
import { DEMO_SLUG } from "./demo";
import { PHONE_DOMAIN } from "./staff";
import { PRICING, money } from "./pricing";
import { canPayOnline } from "./billing";
import { safepayConfig } from "./safepay";
import type { Country } from "./types";

/**
 * Daily job (Vercel Cron, see vercel.json): emails restaurant owners about their free Pro trial.
 *   - 3 days before it ends
 *   - on the last day
 *   - once it has ended (they are now on the Free plan)
 * Paid restaurants, restaurants set to Pro by hand, the demo, and mobile-number logins are skipped.
 * Each step is claimed in the database before sending, so a step is never emailed twice.
 */

type Step = "3d" | "1d" | "ended";
const COLUMN: Record<Step, string> = { "3d": "trial_reminder_3d_at", "1d": "trial_reminder_1d_at", ended: "trial_ended_email_at" };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SITE = "https://tableandbell.com";

interface Row {
  id: string;
  slug: string;
  name: string;
  country: Country;
  plan: string;
  pro_until: string | null;
  trial_ends_at: string;
  trial_reminder_3d_at: string | null;
  trial_reminder_1d_at: string | null;
  trial_ended_email_at: string | null;
}

function stepFor(r: Row, now: number): Step | null {
  const ends = Date.parse(r.trial_ends_at);
  if (r.plan === "pro") return null; // Pro set by hand
  if (r.pro_until && Date.parse(r.pro_until) > now) return null; // already paying
  if (ends <= now) return ends > now - 3 * DAY && !r.trial_ended_email_at ? "ended" : null;
  // 26 hours instead of 24: the daily run can start a little earlier or later each day.
  if (ends <= now + 26 * HOUR) return r.trial_reminder_1d_at ? null : "1d";
  if (ends <= now + 3 * DAY + 2 * HOUR) return r.trial_reminder_3d_at || r.trial_reminder_1d_at ? null : "3d";
  return null;
}

async function ownerEmail(restaurantId: string): Promise<string | null> {
  const db = adminClient();
  const { data: owner } = await db.from("staff").select("user_id").eq("restaurant_id", restaurantId).eq("role", "owner").maybeSingle();
  if (!owner) return null;
  const { data } = await db.auth.admin.getUserById(owner.user_id as string);
  const email = data.user?.email?.toLowerCase() ?? "";
  if (!email || email.endsWith(`@${PHONE_DOMAIN}`)) return null;
  return email;
}

export async function runTrialReminders(now = Date.now()) {
  const db = adminClient();
  const { data, error } = await db
    .from("restaurants")
    .select("id, slug, name, country, plan, pro_until, trial_ends_at, trial_reminder_3d_at, trial_reminder_1d_at, trial_ended_email_at")
    .not("trial_ends_at", "is", null)
    .gt("trial_ends_at", new Date(now - 3 * DAY).toISOString())
    .lte("trial_ends_at", new Date(now + 3 * DAY + 2 * HOUR).toISOString())
    .neq("slug", DEMO_SLUG)
    .limit(500);
  if (error) {
    console.error("[tablepulse] trial reminders: query failed:", error.message);
    return { ok: false as const, error: "query_failed" };
  }

  const summary = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  for (const r of (data ?? []) as Row[]) {
    summary.checked++;
    const step = stepFor(r, now);
    if (!step) continue;
    const to = await ownerEmail(r.id);
    if (!to) {
      summary.skipped++;
      continue;
    }
    // Claim this step first: if two runs overlap, only one sends.
    const col = COLUMN[step];
    const { data: claimed } = await db.from("restaurants").update({ [col]: new Date(now).toISOString() }).eq("id", r.id).is(col, null).select("id").maybeSingle();
    if (!claimed) continue;

    const mail = compose(step, r, now);
    const res = await sendEmail({ to, ...mail });
    if (res.ok) summary.sent++;
    else {
      summary.failed++;
      // Not sent: release the claim so tomorrow's run tries again.
      await db.from("restaurants").update({ [col]: null }).eq("id", r.id);
      if (res.error === "not_configured") return { ok: false as const, error: "RESEND_API_KEY missing", summary };
    }
  }
  return { ok: true as const, summary };
}

// ---------------------------------------------------------------------------
// Email content
// ---------------------------------------------------------------------------

function compose(step: Step, r: Row, now: number) {
  const p = PRICING[r.country];
  const price = money(p.pro, p.currency);
  // Point owners to card checkout only when it takes real payments (not Safepay's test mode).
  const online = canPayOnline(r.country) && safepayConfig().env === "production";
  const ends = new Date(r.trial_ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: r.country === "SA" ? "Asia/Riyadh" : "Asia/Karachi" });
  const days = Math.max(1, Math.ceil((Date.parse(r.trial_ends_at) - now) / DAY));
  const billing = `${SITE}/dashboard/billing`;
  const howToPay = online
    ? `Subscribe from your Plans page for ${price} a month. You can cancel any time.`
    : `To continue on Pro (${price} a month), reply to this email or write to billing@tableandbell.com and we will send you an invoice for bank transfer.`;

  const subject =
    step === "3d"
      ? `Your Table & Bell Pro trial ends in ${days} days`
      : step === "1d"
        ? "Your Table & Bell Pro trial ends tomorrow"
        : "Your Table & Bell Pro trial has ended";

  const lead =
    step === "3d"
      ? `Your free Pro trial for ${r.name} ends on ${ends}.`
      : step === "1d"
        ? `Your free Pro trial for ${r.name} ends on ${ends}, in less than a day.`
        : `Your free Pro trial for ${r.name} ended on ${ends}. Your restaurant is now on the Free plan, and nothing has been deleted.`;

  const keep =
    step === "ended"
      ? "On the Free plan you keep the waitlist, menu, table ordering, floor and kitchen screens, with 150 buzzer alerts a month and up to 2 staff. Loyalty and unlimited alerts need Pro."
      : "When the trial ends, your restaurant moves to the Free plan automatically. You keep the waitlist, menu, table ordering, floor and kitchen screens, with 150 buzzer alerts a month and up to 2 staff. Loyalty, unlimited alerts and up to 20 staff need Pro.";

  const button = online ? "Choose a plan" : "Open my plan";
  const text = [
    `Hello,`,
    ``,
    lead,
    ``,
    keep,
    ``,
    howToPay,
    ``,
    `${button}: ${billing}`,
    ``,
    `Questions? Reply to this email.`,
    ``,
    `Table & Bell`,
    SITE,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#faf7f2;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e0d5;border-radius:16px;overflow:hidden">
<tr><td style="background:#1a1b20;padding:20px;text-align:center">
<img src="${SITE}/brand/logo-full.png" width="180" alt="Table &amp; Bell" style="display:inline-block;border:0;color:#ffffff;font-size:20px;font-weight:bold">
</td></tr>
<tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3">${esc(subject)}</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${esc(lead)}</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#57534e">${esc(keep)}</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.6">${esc(howToPay)}</p>
<p style="margin:0 0 26px;text-align:center">
<a href="${billing}" style="display:inline-block;background:#c84b31;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:12px">${esc(button)}</a>
</p>
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#57534e">Questions? Just reply to this email.</p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e7e0d5;font-size:12px;color:#78716c">
Table &amp; Bell &middot; <a href="${SITE}" style="color:#78716c">tableandbell.com</a> &middot; <a href="${SITE}/privacy" style="color:#78716c">Privacy Policy</a><br>
You are receiving this because you own a Table &amp; Bell restaurant account.
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}

/** For the preview route and tests: the email a given step would send, without sending it. */
export function previewTrialEmail(step: Step, sample: { name: string; country: Country; endsInDays: number }) {
  const now = Date.now();
  return compose(
    step,
    {
      id: "",
      slug: "",
      name: sample.name,
      country: sample.country,
      plan: "free",
      pro_until: null,
      trial_ends_at: new Date(now + sample.endsInDays * DAY).toISOString(),
      trial_reminder_3d_at: null,
      trial_reminder_1d_at: null,
      trial_ended_email_at: null,
    },
    now,
  );
}
