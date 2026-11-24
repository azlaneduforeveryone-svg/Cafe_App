"use client";

import { useState } from "react";
import { Check, Gift, Minus, Plus, Receipt, Star, Users, X } from "lucide-react";
import { fmt, restaurantName, tr } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { money } from "@/lib/pricing";
import { PAY_METHODS, TIP_CHOICES, type Bill, type BillLine, type Country, type Locale, type LoyaltyPromo, type LoyaltyReceipt, type PayMethod, type PublicRestaurant } from "@/lib/types";

const BRAND: Partial<Record<PayMethod, string>> = {
  mada: "mada",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  stc_pay: "STC Pay",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  raast: "Raast",
};
export const methodLabel = (t: Dict, m: PayMethod) => BRAND[m] ?? (m === "cash" ? t.pm_cash : t.pm_card);

const lineName = (l: BillLine, locale: Locale, t: Dict) => {
  const d = t as unknown as Record<string, string>;
  const extra = [l.portion ? l.portion[locale] || l.portion.en : "", l.spice ? d[`spice_${l.spice}`] : ""].filter(Boolean).join(" · ");
  return extra ? `${tr(l, "name", locale)} (${extra})` : tr(l, "name", locale);
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const each = (total: number, ways: number) => round2(Math.ceil((total / Math.max(1, ways)) * 100) / 100);

/**
 * The guest's bill, from "so far" through requested to the paid receipt and rating.
 * Used at a table (QR session) and on a seated waitlist ticket; `endpoint` is the POST route.
 * Figures shown before sending are a preview; the server recomputes everything.
 */
export function BillCard({
  t,
  locale,
  bill,
  currency,
  restaurant,
  endpoint,
  canRequest,
  loyalty = null,
  onChange,
}: {
  t: Dict;
  locale: Locale;
  bill: Bill;
  currency: string;
  restaurant: PublicRestaurant;
  endpoint: string;
  canRequest: boolean;
  loyalty?: LoyaltyPromo | null;
  onChange: () => void;
}) {
  const [sheet, setSheet] = useState(false);

  if (bill.status === "paid") return <ReceiptCard t={t} locale={locale} bill={bill} currency={currency} restaurant={restaurant} endpoint={endpoint} onChange={onChange} />;

  const requested = bill.status === "requested";
  return (
    <section className={`p-4 rounded-2xl border ${requested ? "bg-amber-50 border-gold" : "bg-white border-line"}`}>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center shrink-0">
          <Receipt className="w-5 h-5 text-ember" aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-stone-500">{requested ? t.billRequested : t.billSoFar}</p>
          <p className="font-extrabold text-lg ltr text-start">{money(bill.total, currency)}</p>
          {requested && (
            <p className="text-xs text-stone-600">
              {methodLabel(t, bill.method)}
              {bill.splitWays > 1 && (
                <>
                  {" · "}
                  <bdi>{fmt(t.billEach, { n: bill.splitWays, amount: money(bill.perPerson, currency) })}</bdi>
                </>
              )}
            </p>
          )}
        </div>
        {canRequest && (
          <button type="button" onClick={() => setSheet(true)} className={`px-3.5 py-2.5 rounded-xl text-sm font-extrabold ${requested ? "bg-white border border-line text-ink" : "bg-ink text-white"}`}>
            {requested ? t.billChange : t.billGet}
          </button>
        )}
      </div>
      {requested && <p className="text-[11px] text-stone-600 mt-2">{t.billWaiterComing}</p>}
      {sheet && <BillSheet t={t} locale={locale} bill={bill} currency={currency} country={restaurant.country} endpoint={endpoint} loyalty={loyalty} onClose={() => setSheet(false)} onSent={onChange} />}
    </section>
  );
}

export function BillSheet({
  t,
  locale,
  bill,
  currency,
  country,
  endpoint,
  loyalty = null,
  onClose,
  onSent,
}: {
  t: Dict;
  locale: Locale;
  bill: Bill;
  currency: string;
  country: Country;
  endpoint: string;
  loyalty?: LoyaltyPromo | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [phone, setPhone] = useState("");
  const methods = PAY_METHODS[country];
  const [split, setSplit] = useState(bill.splitWays);
  const [tip, setTip] = useState(bill.tipPct);
  const [method, setMethod] = useState<PayMethod>(methods.includes(bill.method) ? bill.method : "cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = t as unknown as Record<string, string>;

  const tipAmount = round2((bill.subtotal * tip) / 100);
  const total = round2(bill.subtotal + tipAmount);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", tipPct: tip, split, method, ...(phone.trim() ? { phone: phone.trim() } : {}) }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      onSent();
      onClose();
      return;
    }
    const code = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : undefined;
    setError(code && d[`billErr_${code}`] ? d[`billErr_${code}`] : t.errorGeneric);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label={t.guestBillTitle}>
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-cream rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="sticky top-0 bg-cream/95 backdrop-blur px-5 pt-4 pb-3 flex items-center justify-between border-b border-line">
          <h2 className="display text-xl font-bold">{t.guestBillTitle}</h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="w-9 h-9 rounded-full bg-white border border-line flex items-center justify-center">
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <Lines t={t} locale={locale} lines={bill.lines} currency={currency} />

          <fieldset>
            <legend className="text-xs font-extrabold uppercase tracking-wider text-stone-500 mb-2">{t.billTip}</legend>
            <div className="grid grid-cols-4 gap-2">
              {TIP_CHOICES.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={tip === p}
                  onClick={() => setTip(p)}
                  className={`py-2.5 rounded-xl text-sm font-extrabold border ${tip === p ? "bg-ink text-white border-ink" : "bg-white border-line"}`}
                >
                  {p === 0 ? t.billNoTip : <bdi dir="ltr">{p}%</bdi>}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-extrabold uppercase tracking-wider text-stone-500 mb-2">{t.billSplit}</legend>
            <div className="flex items-center gap-3">
              <button type="button" aria-label={t.billSplitLess} disabled={split <= 1} onClick={() => setSplit((n) => Math.max(1, n - 1))} className="w-11 h-11 rounded-xl bg-white border border-line flex items-center justify-center disabled:opacity-40">
                <Minus className="w-4 h-4" aria-hidden />
              </button>
              <div className="flex-1 text-center">
                <p className="font-extrabold text-lg flex items-center justify-center gap-1.5">
                  <Users className="w-4 h-4 text-ember" aria-hidden />
                  {split === 1 ? t.billOnePays : fmt(t.billWays, { n: split })}
                </p>
                {split > 1 && <p className="text-xs text-stone-600">{fmt(t.billEachShort, { amount: money(each(total, split), currency) })}</p>}
              </div>
              <button type="button" aria-label={t.billSplitMore} disabled={split >= 20} onClick={() => setSplit((n) => Math.min(20, n + 1))} className="w-11 h-11 rounded-xl bg-white border border-line flex items-center justify-center disabled:opacity-40">
                <Plus className="w-4 h-4" aria-hidden />
              </button>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-extrabold uppercase tracking-wider text-stone-500 mb-2">{t.billMethod}</legend>
            <div className="grid grid-cols-3 gap-2">
              {methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                  className={`py-2.5 px-1 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1 ${method === m ? "bg-ink text-white border-ink" : "bg-white border-line"}`}
                >
                  {method === m && <Check className="w-3.5 h-3.5" aria-hidden />}
                  {methodLabel(t, m)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-500 mt-2">{t.billMethodNote}</p>
          </fieldset>

          {loyalty && (
            <fieldset className="p-3.5 rounded-2xl bg-white border border-line space-y-2">
              <legend className="sr-only">{t.loyTitle}</legend>
              <p className="flex items-start gap-2 text-sm font-extrabold">
                <Gift className="w-4 h-4 text-ember shrink-0 mt-0.5" aria-hidden />
                <span>{promoText(t, locale, loyalty, currency)}</span>
              </p>
              {bill.loyaltyPhone && !phone ? (
                <p className="text-xs text-stone-600">
                  {t.loyLinked} <bdi dir="ltr" className="font-bold">{bill.loyaltyPhone}</bdi>
                </p>
              ) : null}
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value.slice(0, 20))}
                placeholder={country === "SA" ? "05XXXXXXXX" : "03XXXXXXXXX"}
                aria-label={t.loyPhone}
                className="w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-base text-start"
              />
              <p className="text-[11px] text-stone-500">{t.loyPrivacy}</p>
            </fieldset>
          )}

          <Totals t={t} subtotal={bill.subtotal} tipPct={tip} tipAmount={tipAmount} total={total} currency={currency} />

          {error && (
            <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 bg-cream/95 backdrop-blur px-5 py-4 border-t border-line">
          <button type="button" disabled={busy} onClick={send} className="w-full py-4 rounded-2xl bg-ember hover:bg-ember-dark text-white font-extrabold text-base disabled:opacity-60">
            {bill.status === "requested" ? t.billUpdate : t.billSend}
            {" · "}
            <bdi dir="ltr">{money(total, currency)}</bdi>
          </button>
        </div>
      </div>
    </div>
  );
}

function Lines({ t, locale, lines, currency }: { t: Dict; locale: Locale; lines: BillLine[]; currency: string }) {
  return (
    <ul className="divide-y divide-line bg-white rounded-2xl border border-line" aria-label={t.billItems}>
      {lines.map((l, i) => (
        <li key={i} className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-sm">
          <span className="min-w-0">
            <span className="font-extrabold ltr inline-block">{l.qty}×</span> {lineName(l, locale, t)}
          </span>
          <span className="font-bold shrink-0 ltr">{money(round2(l.price * l.qty), currency)}</span>
        </li>
      ))}
    </ul>
  );
}

function Totals({ t, subtotal, tipPct, tipAmount, total, currency }: { t: Dict; subtotal: number; tipPct: number; tipAmount: number; total: number; currency: string }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between">
        <dt className="text-stone-600">{t.billSubtotal}</dt>
        <dd className="font-bold ltr">{money(subtotal, currency)}</dd>
      </div>
      {tipAmount > 0 && (
        <div className="flex justify-between">
          <dt className="text-stone-600">
            {t.billTip} <bdi dir="ltr">({tipPct}%)</bdi>
          </dt>
          <dd className="font-bold ltr">{money(tipAmount, currency)}</dd>
        </div>
      )}
      <div className="flex justify-between pt-1.5 border-t border-line text-base">
        <dt className="font-extrabold">{t.billTotal}</dt>
        <dd className="font-extrabold ltr">{money(total, currency)}</dd>
      </div>
    </dl>
  );
}

/** Paid: the receipt, then the rating (once). */
export function ReceiptCard({
  t,
  locale,
  bill,
  currency,
  restaurant,
  endpoint,
  onChange,
}: {
  t: Dict;
  locale: Locale;
  bill: Bill;
  currency: string;
  restaurant: PublicRestaurant;
  endpoint: string;
  onChange: () => void;
}) {
  const paid = bill.paidAt ? new Date(bill.paidAt) : null;
  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl border border-line overflow-hidden" aria-label={t.receiptTitle}>
        <div className="bg-emerald-600 text-white px-4 py-3 flex items-center gap-2">
          <Check className="w-5 h-5" aria-hidden />
          <p className="font-extrabold">{t.receiptPaid}</p>
        </div>
        <div className="p-4 space-y-4">
          <div className="text-center space-y-0.5">
            <p className="display text-lg font-bold">{restaurantName(restaurant, locale)}</p>
            <p className="text-xs text-stone-600">
              {t.receiptNo} <bdi dir="ltr">#{bill.receiptNo}</bdi>
              {paid && (
                <>
                  {" · "}
                  <bdi>{paid.toLocaleString(locale === "en" ? "en-GB" : locale === "ar" ? "ar-SA-u-nu-latn" : "ur-PK-u-nu-latn", { dateStyle: "medium", timeStyle: "short" })}</bdi>
                </>
              )}
            </p>
          </div>
          <Lines t={t} locale={locale} lines={bill.lines} currency={currency} />
          <Totals t={t} subtotal={bill.subtotal} tipPct={bill.tipPct} tipAmount={bill.tipAmount} total={bill.total} currency={currency} />
          <div className="text-xs text-stone-600 flex flex-wrap justify-between gap-2">
            <span>
              {t.billMethod}: <b>{methodLabel(t, bill.method)}</b>
            </span>
            {bill.splitWays > 1 && <bdi>{fmt(t.billEach, { n: bill.splitWays, amount: money(bill.perPerson, currency) })}</bdi>}
          </div>
          <p className="text-[10px] text-stone-500 text-center border-t border-dashed border-line pt-3">{t.receiptNotTax}</p>
        </div>
      </section>
      {bill.loyalty && <LoyaltyProgress t={t} locale={locale} l={bill.loyalty} />}
      <Rating t={t} bill={bill} endpoint={endpoint} onChange={onChange} />
    </div>
  );
}

function Rating({ t, bill, endpoint, onChange }: { t: Dict; bill: Bill; endpoint: string; onChange: () => void }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (bill.rating) {
    return (
      <section className="p-4 rounded-2xl bg-white border border-line text-center space-y-1">
        <div className="flex justify-center gap-1" aria-label={`${bill.rating.stars}/5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`w-6 h-6 ${n <= bill.rating!.stars ? "fill-gold text-gold" : "text-stone-300"}`} aria-hidden />
          ))}
        </div>
        <p className="font-extrabold text-sm">{t.rateThanks}</p>
      </section>
    );
  }

  async function send() {
    setBusy(true);
    setError(false);
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rate", stars, comment }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) onChange();
    else setError(true);
  }

  return (
    <section className="p-4 rounded-2xl bg-white border border-line space-y-3">
      <p className="font-extrabold text-center">{t.rateTitle}</p>
      <div className="flex justify-center gap-1.5" role="radiogroup" aria-label={t.rateTitle}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n}/5`} onClick={() => setStars(n)} className="p-1">
            <Star className={`w-9 h-9 transition ${n <= stars ? "fill-gold text-gold" : "text-stone-300"}`} aria-hidden />
          </button>
        ))}
      </div>
      {stars > 0 && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 300))}
            rows={2}
            placeholder={t.ratePlaceholder}
            aria-label={t.ratePlaceholder}
            className="w-full rounded-xl border border-line bg-cream px-3 py-2 text-sm"
          />
          <button type="button" disabled={busy} onClick={send} className="w-full py-3 rounded-xl bg-ink text-white font-extrabold text-sm disabled:opacity-60">
            {t.rateSend}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs font-bold text-red-700 text-center">
          {t.errorGeneric}
        </p>
      )}
    </section>
  );
}

function promoText(t: Dict, locale: Locale, l: LoyaltyPromo, currency: string) {
  const top = l.rewards[0];
  const reward = top ? tr(top, "name", locale) : t.loyAReward;
  if (l.mode === "stamps") {
    const base = fmt(t.loyPromoStamps, { n: l.stampsNeeded, reward });
    return l.stampMinSpend > 0 ? `${base} ${fmt(t.loyMinSpend, { amount: money(l.stampMinSpend, currency) })}` : base;
  }
  return fmt(t.loyPromoPoints, { amount: money(l.spendPerPoint, currency), reward, cost: top?.cost ?? "" });
}

/** On the paid receipt: the stamp card or points, and the next reward. */
function LoyaltyProgress({ t, locale, l }: { t: Dict; locale: Locale; l: LoyaltyReceipt }) {
  const stamps = l.mode === "stamps";
  const balance = stamps ? l.stamps : l.points;
  const earned = stamps ? l.earnedStamps : l.earnedPoints;
  const r = l.nextReward;
  const filled = stamps ? Math.min(l.stamps, l.stampsNeeded) : 0;
  return (
    <section className="p-4 rounded-2xl bg-white border border-line space-y-3" aria-label={t.loyTitle}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-extrabold flex items-center gap-2">
          <Gift className="w-4 h-4 text-ember" aria-hidden />
          {earned > 0 ? fmt(stamps ? t.loyEarnedStamps : t.loyEarnedPoints, { n: earned }) : t.loyNoEarn}
        </p>
        <p className="text-sm font-extrabold">
          <bdi>{fmt(stamps ? t.loyBalanceStamps : t.loyBalancePoints, { n: balance })}</bdi>
        </p>
      </div>
      {stamps && (
        <div className="flex flex-wrap gap-1.5" aria-label={`${filled}/${l.stampsNeeded}`}>
          {Array.from({ length: l.stampsNeeded }, (_, i) => (
            <span key={i} className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${i < filled ? "bg-ember border-ember text-white" : "border-line bg-cream"}`}>
              {i < filled && <Check className="w-4 h-4" aria-hidden />}
            </span>
          ))}
        </div>
      )}
      {r && (
        <p className={`text-sm font-bold rounded-xl px-3 py-2 ${r.ready ? "bg-emerald-50 text-emerald-900" : "bg-cream text-stone-700"}`}>
          {r.ready ? fmt(t.loyReady, { reward: tr(r, "name", locale) }) : fmt(stamps ? t.loyMoreStamps : t.loyMorePoints, { n: r.cost - balance, reward: tr(r, "name", locale) })}
        </p>
      )}
    </section>
  );
}
