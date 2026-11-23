"use client";

import { useState } from "react";
import { Check, Receipt, Star } from "lucide-react";
import { Modal } from "@/components/Modal";
import { methodLabel } from "@/components/guest/BillCard";
import { fmt } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { money } from "@/lib/pricing";
import { PAY_METHODS, type BillSummary, type Country, type PayMethod } from "@/lib/types";

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
  onConfirm,
  onClose,
}: {
  t: Dict;
  title: string;
  country: Country;
  currency: string;
  bill: BillSummary | null;
  fallbackTotal: number;
  onConfirm: (method: PayMethod) => Promise<boolean>;
  onClose: () => void;
}) {
  const methods = PAY_METHODS[country];
  const [method, setMethod] = useState<PayMethod>(bill && methods.includes(bill.method) ? bill.method : "cash");
  const [busy, setBusy] = useState(false);
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
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await onConfirm(method);
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
