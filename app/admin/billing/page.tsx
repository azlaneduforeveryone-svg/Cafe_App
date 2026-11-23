import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { adminOverview, billingConfig, GRACE_DAYS, isAdminEmail } from "@/lib/billing";
import { siteOrigin } from "@/lib/locale";
import { money, PRICING } from "@/lib/pricing";
import { safepayConfig } from "@/lib/safepay";
import { linkEventAction, manualPaymentAction, markCancelledAction, reprocessAction } from "./actions";

export const dynamic = "force-dynamic";

const dt = (ms: number | string | null) =>
  ms ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(ms)) : "–";

/** Owner's back office for billing. Only logins listed in ADMIN_EMAILS can open it. English only. */
export default async function AdminBillingPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const ctx = await getStaff();
  if (!ctx || !isAdminEmail(ctx.staff.email)) notFound();
  const { msg } = await searchParams;
  const data = await adminOverview();
  const sp = safepayConfig();
  const cfg = billingConfig();
  const origin = await siteOrigin();
  const open = data.events.filter((e) => e.result !== "ok" && e.result !== "ignored");

  return (
    <div dir="ltr" lang="en" className="min-h-screen bg-cream">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold">Billing admin</h1>
          <Link href="/dashboard" className="text-ember font-bold hover:underline">
            Back to the app
          </Link>
        </div>
        {msg && <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">{msg}</p>}

        <Box title="Setup">
          <ul className="space-y-1">
            <li>
              Safepay: <b>{sp.env}</b>, {sp.ready ? <span className="text-emerald-700 font-bold">ready</span> : <span className="text-red-700 font-bold">not configured</span>}
              {!sp.ready && " (needs SAFEPAY_SECRET_KEY, SAFEPAY_WEBHOOK_SECRET and SAFEPAY_PLAN_ID_PK)"}
            </li>
            <li>
              Webhook URL to enter in Safepay: <code className="bg-stone-100 px-1.5 py-0.5 rounded">{origin}/api/webhooks/safepay</code>
            </li>
            <li>
              Prices: Pakistan {money(PRICING.PK.pro, PRICING.PK.currency)}, Saudi Arabia {money(PRICING.SA.pro, PRICING.SA.currency)} a month (edit lib/pricing.ts). Grace after a paid period: {GRACE_DAYS} days.
            </li>
            <li>
              Invoices issued as <b>{cfg.seller.name}</b>
              {cfg.seller.taxId ? `, tax no. ${cfg.seller.taxId}` : ", no tax number set"}; tax {cfg.taxRate ? `${cfg.taxLabel} ${cfg.taxRate}% included in the price` : "not shown"}.
            </li>
          </ul>
        </Box>

        <Box title={`Cancellation requests (${data.cancels.length})`} note="Cancel each one in the Safepay dashboard first, then mark it here. Pro stays on until the paid period ends.">
          {data.cancels.length === 0 ? (
            <p className="text-stone-500">None.</p>
          ) : (
            <Table head={["Restaurant", "Safepay subscription", "Requested", ""]}>
              {data.cancels.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-2 pe-3">
                    {s.restaurantName} <span className="text-stone-400">/{s.restaurantSlug}</span>
                  </td>
                  <td className="py-2 pe-3 font-mono text-xs">{s.providerSubId ?? "–"}</td>
                  <td className="py-2 pe-3">{dt(s.cancelRequestedAt)}</td>
                  <td className="py-2 text-end">
                    <form action={markCancelledAction}>
                      <input type="hidden" name="subscription" value={s.id} />
                      <button className="px-3 py-1.5 rounded-lg bg-ink text-white text-xs font-bold">Cancelled in Safepay</button>
                    </form>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Box>

        <Box title={`Payments needing attention (${open.length})`} note="Unmatched: Safepay sent a payment the app couldn't tie to a restaurant (usually the owner paid with a different email). Type the restaurant's address name to link it; the payment is then applied and the invoice issued.">
          {open.length === 0 ? (
            <p className="text-stone-500">Nothing to fix.</p>
          ) : (
            <Table head={["Received", "Event", "Email / subscription", "Problem", ""]}>
              {open.map((e) => (
                <tr key={e.id} className="border-t border-line align-top">
                  <td className="py-2 pe-3 whitespace-nowrap">{dt(e.receivedAt)}</td>
                  <td className="py-2 pe-3">{e.type}</td>
                  <td className="py-2 pe-3 text-xs">
                    {e.email || "–"}
                    <br />
                    <span className="font-mono text-stone-500">{e.subId ?? ""}</span>
                  </td>
                  <td className="py-2 pe-3 text-xs">
                    <b>{e.result ?? "not processed"}</b> {e.detail}
                  </td>
                  <td className="py-2 text-end">
                    {e.result === "unmatched" && e.subId ? (
                      <form action={linkEventAction} className="flex gap-1 justify-end">
                        <input type="hidden" name="event" value={e.id} />
                        <input name="slug" required placeholder="restaurant-slug" className="border border-line rounded-lg px-2 py-1 w-36" />
                        <button className="px-3 py-1.5 rounded-lg bg-ember text-white text-xs font-bold">Link</button>
                      </form>
                    ) : (
                      <form action={reprocessAction}>
                        <input type="hidden" name="event" value={e.id} />
                        <button className="px-3 py-1.5 rounded-lg bg-white border border-line text-xs font-bold">Re-run</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Box>

        <Box title="Record a bank transfer or other offline payment" note="Issues an invoice and extends Pro from today, or from the end of the current paid period. Use this for Saudi restaurants until a Saudi gateway is connected.">
          <form action={manualPaymentAction} className="grid sm:grid-cols-6 gap-2 items-end">
            <Field label="Restaurant slug" className="sm:col-span-2">
              <input name="slug" required className="w-full border border-line rounded-lg px-2 py-1.5" />
            </Field>
            <Field label="Months">
              <input name="months" type="number" min={1} max={24} defaultValue={1} required className="w-full border border-line rounded-lg px-2 py-1.5" />
            </Field>
            <Field label="Amount received">
              <input name="amount" type="number" min={0} step="0.01" required className="w-full border border-line rounded-lg px-2 py-1.5" />
            </Field>
            <Field label="Currency">
              <select name="currency" className="w-full border border-line rounded-lg px-2 py-1.5">
                <option>SAR</option>
                <option>PKR</option>
                <option>USD</option>
              </select>
            </Field>
            <Field label="Method">
              <select name="method" className="w-full border border-line rounded-lg px-2 py-1.5">
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
              </select>
            </Field>
            <Field label="Note on the invoice (optional)" className="sm:col-span-5">
              <input name="note" maxLength={300} className="w-full border border-line rounded-lg px-2 py-1.5" />
            </Field>
            <button className="px-4 py-2 rounded-lg bg-ink text-white font-bold">Record payment</button>
          </form>
        </Box>

        <Box title={`Restaurants (${data.restaurants.length})`}>
          <Table head={["Restaurant", "Country", "Access", "Paid until", "Trial ends", "Joined"]}>
            {data.restaurants.map((r) => {
              const { paid, access } = r;
              return (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-1.5 pe-3">
                    {r.name} <span className="text-stone-400">/{r.slug}</span>
                  </td>
                  <td className="py-1.5 pe-3">{r.country}</td>
                  <td className={`py-1.5 pe-3 font-bold ${paid ? "text-emerald-700" : ""}`}>{access}</td>
                  <td className="py-1.5 pe-3">{dt(r.pro_until)}</td>
                  <td className="py-1.5 pe-3">{dt(r.trial_ends_at)}</td>
                  <td className="py-1.5">{dt(r.created_at)}</td>
                </tr>
              );
            })}
          </Table>
        </Box>

        <Box title="Latest invoices">
          {data.invoices.length === 0 ? (
            <p className="text-stone-500">None yet.</p>
          ) : (
            <Table head={["Number", "Issued", "Restaurant", "Method", "Total", ""]}>
              {data.invoices.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="py-1.5 pe-3 font-mono text-xs">{i.number}</td>
                  <td className="py-1.5 pe-3">{dt(i.issuedAt)}</td>
                  <td className="py-1.5 pe-3">{i.buyer.name}</td>
                  <td className="py-1.5 pe-3">{i.method}</td>
                  <td className="py-1.5 pe-3">{money(i.total, i.currency)}</td>
                  <td className="py-1.5 text-end">
                    <Link href={`/dashboard/billing/invoices/${i.id}`} className="text-ember font-bold hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Box>

        <Box title="All recent webhook events">
          <Table head={["Received", "Event", "Result", "Detail"]}>
            {data.events.map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="py-1.5 pe-3 whitespace-nowrap">{dt(e.receivedAt)}</td>
                <td className="py-1.5 pe-3">{e.type}</td>
                <td className="py-1.5 pe-3 font-bold">{e.result ?? "pending"}</td>
                <td className="py-1.5 text-xs">{e.detail}</td>
              </tr>
            ))}
          </Table>
        </Box>
      </main>
    </div>
  );
}

function Box({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-line p-5">
      <h2 className="font-extrabold text-base">{title}</h2>
      {note && <p className="text-xs text-stone-500 mt-0.5">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-stone-500">
            {head.map((h, i) => (
              <th key={i} className="text-start font-bold pb-2 pe-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-bold text-stone-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
