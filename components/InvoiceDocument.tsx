import type { Invoice } from "@/lib/billing";
import { money } from "@/lib/pricing";

const d = (ms: number) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(ms));
const METHOD: Record<string, string> = { card: "Card (Safepay)", bank_transfer: "Bank transfer", cash: "Cash" };

/** Printable invoice, always in English (left to right) so it reads the same for accountants. */
export function InvoiceDocument({ inv }: { inv: Invoice }) {
  const s = inv.seller;
  const b = inv.buyer;
  return (
    <article dir="ltr" lang="en" className="bg-white rounded-2xl border border-line p-6 sm:p-10 print:border-0 print:rounded-none print:p-0 text-sm text-ink">
      <header className="flex flex-wrap justify-between gap-6 border-b border-line pb-6">
        <div>
          <p className="text-2xl font-extrabold">{s.name || "TablePulse"}</p>
          {s.address && <p className="text-stone-600 whitespace-pre-line mt-1">{s.address}</p>}
          {s.taxId && <p className="text-stone-600 mt-1">Tax registration no.: {s.taxId}</p>}
          {s.email && <p className="text-stone-600">{s.email}</p>}
        </div>
        <div className="text-end">
          <p className="text-xl font-extrabold tracking-wide">{inv.status === "void" ? "INVOICE (VOID)" : "INVOICE"}</p>
          <p className="mt-1 font-mono">{inv.number}</p>
          <p className="text-stone-600 mt-1">Date: {d(inv.issuedAt)}</p>
          <p className="mt-2 inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">{inv.status === "paid" ? "PAID" : "VOID"}</p>
        </div>
      </header>

      <section className="py-6 grid sm:grid-cols-2 gap-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Billed to</p>
          <p className="font-bold mt-1">{b.name}</p>
          {b.email && <p className="text-stone-600">{b.email}</p>}
          {b.country && <p className="text-stone-600">{b.country === "PK" ? "Pakistan" : b.country === "SA" ? "Saudi Arabia" : b.country}</p>}
        </div>
        <div className="sm:text-end">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Payment</p>
          <p className="mt-1">{METHOD[inv.method] ?? inv.method}</p>
          {inv.providerTxnId && !inv.providerTxnId.startsWith("manual_") && <p className="text-stone-600 font-mono text-xs">Ref: {inv.providerTxnId}</p>}
        </div>
      </section>

      <table className="w-full">
        <thead>
          <tr className="border-y border-line text-[11px] uppercase tracking-wider text-stone-500">
            <th className="text-start py-2 font-bold">Description</th>
            <th className="text-start py-2 font-bold">Period</th>
            <th className="text-end py-2 font-bold">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line">
            <td className="py-3">{inv.description}</td>
            <td className="py-3 text-stone-600">
              {d(inv.periodStart)} to {d(inv.periodEnd)}
            </td>
            <td className="py-3 text-end">{money(inv.taxRate ? inv.netAmount : inv.total, inv.currency)}</td>
          </tr>
        </tbody>
      </table>

      <div className="flex justify-end mt-4">
        <dl className="w-full max-w-xs space-y-1">
          {inv.taxRate > 0 && (
            <>
              <div className="flex justify-between">
                <dt className="text-stone-600">Subtotal</dt>
                <dd>{money(inv.netAmount, inv.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-600">
                  {inv.taxLabel || "Tax"} ({inv.taxRate}%)
                </dt>
                <dd>{money(inv.taxAmount, inv.currency)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-ink pt-2 font-extrabold text-base">
            <dt>Total</dt>
            <dd>{money(inv.total, inv.currency)}</dd>
          </div>
        </dl>
      </div>

      {inv.note && <p className="mt-6 text-stone-600">Note: {inv.note}</p>}
      <p className="mt-10 text-[11px] text-stone-500">Thank you for using TablePulse. This invoice was generated electronically.</p>
    </article>
  );
}
