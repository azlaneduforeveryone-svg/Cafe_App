"use client";

import { useEffect, useState } from "react";
import { Check, Gift, Receipt, Search, Star } from "lucide-react";
import { Modal } from "@/components/Modal";
import { methodLabel } from "@/components/guest/BillCard";
import { fmt, tr } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { money } from "@/lib/pricing";
import { PAY_METHODS, type BillSummary, type Country, type Locale, type LoyaltyMemberView, type LoyaltyMode, type PayMethod } from "@/lib/types";

export interface PaidExtras {
  phone?: string;
  memberId?: string;
  rewardId?: string;
}

/** Bill line on a staff table card: what the guest asked for, or the paid receipt. */
export function BillStrip({ t, bill, currency }: { t: Dict; bill: BillSummary; currency: string }) {
  if (bill.status === "paid") {
    return (
      <p className="flex flex-wrap items-center justify-between gap-1 px-2 py-1 rounded-lg bg-emerald-100 text-emerald-900 text-[11px] font-extrabold">
        <span className="flex items-center gap-1">
          <Check className="w-3 h-3" aria-hidden />
          {t.billPaidShort} <bdi dir="ltr">#{bill.receiptNo}</bdi>
        </span>
        <span className="flex items-center gap-1 ltr whitespace-nowrap">
          {money(bill.total, currency)}
          {bill.stars !== null && (
            <>
              {" · "}
              {bill.stars}
              <Star className="w-3 h-3 fill-gold text-gold" aria-hidden />
            </>
          )}
        </span>
      </p>
    );
  }
  return (
    <div className="px-2 py-1.5 rounded-lg bg-amber-100 text-amber-950 text-[11px] font-bold space-y-0.5">
      <p className="flex items-center justify-between gap-1 font-extrabold">
        <span className="flex items-center gap-1">
          <Receipt className="w-3 h-3" aria-hidden />
          {t.billRequestedShort}
        </span>
        <span className="ltr">{money(bill.total, currency)}</span>
      </p>
      <p className="flex flex-wrap justify-between gap-x-2">
        <span>{methodLabel(t, bill.method)}</span>
        {bill.splitWays > 1 && <bdi>{fmt(t.billEach, { n: bill.splitWays, amount: money(bill.perPerson, currency) })}</bdi>}
        {bill.tipAmount > 0 && <span>{fmt(t.billTipShort, { amount: money(bill.tipAmount, currency) })}</span>}
      </p>
    </div>
  );
}

/** Staff confirm payment. The method defaults to what the guest chose. */
export function MarkPaidModal({
  t,
  title,
  country,
  currency,
  bill,
  fallbackTotal,
  locale,
  loyaltyMode,
  target,
  onConfirm,
  onClose,
}: {
  t: Dict;
  title: string;
  country: Country;
  currency: string;
  bill: BillSummary | null;
  fallbackTotal: number;
  locale: Locale;
  loyaltyMode: LoyaltyMode;
  /** Whose bill: used to find the loyalty number the guest gave. */
  target: { sessionId?: string; entryId?: string };
  onConfirm: (method: PayMethod, extras: PaidExtras) => Promise<boolean>;
  onClose: () => void;
}) {
  const methods = PAY_METHODS[country];
  const [method, setMethod] = useState<PayMethod>(bill && methods.includes(bill.method) ? bill.method : "cash");
  const [busy, setBusy] = useState(false);
  const loyaltyOn = loyaltyMode !== "off";
  const [phone, setPhone] = useState("");
  const [guestPhone, setGuestPhone] = useState<string | null>(null);
  const [member, setMember] = useState<LoyaltyMemberView | null>(null);
  const [looked, setLooked] = useState(false);
  const [lookupErr, setLookupErr] = useState(false);
  const [rewardId, setRewardId] = useState<string>("");

  async function lookup(params: Record<string, string>) {
    setLookupErr(false);
    const res = await fetch(`/api/host/loyalty?${new URLSearchParams(params)}`).catch(() => null);
    if (!res?.ok) {
      setLookupErr(true);
      return;
    }
    const out = (await res.json()) as { member: LoyaltyMemberView | null; phoneMasked: string | null };
    setMember(out.member);
    setRewardId("");
    setLooked(true);
    return out;
  }

  // On open, look up the number the guest put on the bill (staff never see it in full).
  useEffect(() => {
    if (!loyaltyOn) return;
    const p: Record<string, string> = target.sessionId ? { sessionId: target.sessionId } : target.entryId ? { entryId: target.entryId } : {};
    if (!Object.keys(p).length) return;
    void (async () => {
      const res = await fetch(`/api/host/loyalty?${new URLSearchParams(p)}`).catch(() => null);
      if (!res?.ok) return;
      const out = (await res.json()) as { member: LoyaltyMemberView | null; phoneMasked: string | null };
      setGuestPhone(out.phoneMasked);
      setMember(out.member);
      setLooked(!!out.phoneMasked);
    })();
  }, [loyaltyOn, target.sessionId, target.entryId]);
  const total = bill?.total ?? fallbackTotal;
  return (
    <Modal title={title} onClose={onClose} closeLabel={t.close}>
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-xs font-bold text-stone-500">{t.billTotal}</p>
          <p className="text-3xl font-extrabold ltr">{money(total, currency)}</p>
          {bill && bill.splitWays > 1 && <p className="text-xs text-stone-600">{fmt(t.billEach, { n: bill.splitWays, amount: money(bill.perPerson, currency) })}</p>}
          {!bill && <p className="text-[11px] text-stone-500 mt-1">{t.markPaidNoRequest}</p>}
        </div>
        <fieldset>
          <legend className="text-xs font-extrabold text-stone-500 mb-2">{t.billMethod}</legend>
          <div className="grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                onClick={() => setMethod(m)}
                className={`py-2.5 px-1 rounded-xl text-xs font-extrabold border ${method === m ? "bg-ink text-white border-ink" : "bg-white border-line"}`}
              >
                {methodLabel(t, m)}
              </button>
            ))}
          </div>
        </fieldset>
        {loyaltyOn && (
          <fieldset className="p-3 rounded-2xl bg-cream border border-line space-y-2">
            <legend className="text-xs font-extrabold text-stone-500 px-1 flex items-center gap-1">
              <Gift className="w-3.5 h-3.5 text-ember" aria-hidden />
              {t.loyTitle}
            </legend>
            {guestPhone && !phone && (
              <p className="text-xs text-stone-700">
                {t.loyGuestGave} <bdi dir="ltr" className="font-bold">{guestPhone}</bdi>
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value.slice(0, 20))}
                placeholder={guestPhone ? t.loyOtherNumber : t.loyPhone}
                aria-label={t.loyPhone}
                className="flex-1 min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm text-start"
              />
              <button type="button" disabled={!phone.trim()} onClick={() => void lookup({ phone })} aria-label={t.loyLookup} className="px-3 rounded-xl bg-ink text-white disabled:opacity-40">
                <Search className="w-4 h-4" aria-hidden />
              </button>
            </div>
            {lookupErr && <p role="alert" className="text-xs font-bold text-red-700">{t.loyBadPhone}</p>}
            {looked && !member && !lookupErr && <p className="text-xs text-stone-600">{t.loyNewMember}</p>}
            {member && (
              <div className="space-y-2">
                <p className="text-sm">
                  <b>{member.name || t.loyNoName}</b> <bdi dir="ltr" className="text-stone-500">{member.phoneMasked}</bdi>
                  {" · "}
                  <bdi>{fmt(loyaltyMode === "stamps" ? t.loyBalanceStamps : t.loyBalancePoints, { n: loyaltyMode === "stamps" ? member.stamps : member.points })}</bdi>
                  {" · "}
                  {fmt(t.loyVisits, { n: member.visits })}
                </p>
                {member.rewards.some((w) => w.affordable) && (
                  <div className="space-y-1" role="radiogroup" aria-label={t.loyRedeem}>
                    <p className="text-[11px] font-extrabold text-stone-500">{t.loyRedeem}</p>
                    {[{ id: "", label: t.loyRedeemNone }, ...member.rewards.filter((w) => w.affordable).map((w) => ({ id: w.id, label: `${tr(w, "name", locale)} (${w.cost})` }))].map((o) => (
                      <label key={o.id || "none"} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-sm cursor-pointer ${rewardId === o.id ? "bg-white border-ink font-bold" : "border-line"}`}>
                        <input type="radio" name="reward" checked={rewardId === o.id} onChange={() => setRewardId(o.id)} />
                        {o.label}
                      </label>
                    ))}
                    {rewardId && <p className="text-[11px] text-amber-800 font-bold">{t.loyCheckName}</p>}
                  </div>
                )}
              </div>
            )}
          </fieldset>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await onConfirm(method, { ...(phone.trim() ? { phone: phone.trim() } : {}), ...(member ? { memberId: member.id } : {}), ...(rewardId ? { rewardId } : {}) });
            setBusy(false);
            if (ok) onClose();
          }}
          className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" aria-hidden />
          {t.markPaidConfirm}
        </button>
      </div>
    </Modal>
  );
}
