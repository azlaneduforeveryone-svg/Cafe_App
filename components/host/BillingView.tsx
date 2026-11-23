"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CreditCard, Crown, FileText, Landmark, Loader2 } from "lucide-react";
import { fmt } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { money } from "@/lib/pricing";
import type { Locale } from "@/lib/types";

export interface BillingProps {
  t: Dict;
  locale: Locale;
  access: { kind: "paid" | "trial" | "comp" | "free"; until: number | null };
  trialEnded: boolean;
  sub: { status: string; provider: "safepay" | "manual"; cancelRequestedAt: number | null; currentPeriodEnd: number | null } | null;
  invoices: { id: string; number: string; issuedAt: number; periodStart: number; periodEnd: number; total: number; currency: string }[];
  price: { amount: number; currency: string };
  taxNote: string | null;
  canPayOnline: boolean;
  isOwner: boolean;
  contact: string;
  freeLimit: number;
  checkout: "return" | "cancelled" | null;
}

const INTL: Record<Locale, string> = { en: "en-GB", ar: "ar", ur: "ur" };

export function BillingView(p: BillingProps) {
  const { t, locale } = p;
  const router = useRouter();
  const d = t as unknown as Record<string, string>;
  const date = (ms: number | null) =>
    ms ? new Intl.DateTimeFormat(INTL[locale], { day: "numeric", month: "short", year: "numeric", calendar: "gregory", numberingSystem: "latn" }).format(new Date(ms)) : "";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [waiting, setWaiting] = useState(p.checkout === "return" && p.access.kind !== "paid");
  const [waitedLong, setWaitedLong] = useState(false);
  const [done, setDone] = useState(false);

  // After returning from Safepay: wait for the payment webhook (up to 3 minutes).
  useEffect(() => {
    if (!waiting) return;
    const startedAt = Date.now();
    const iv = setInterval(async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed > 30_000) setWaitedLong(true);
      if (elapsed > 180_000) {
        clearInterval(iv);
        return;
      }
      try {
        const res = await fetch("/api/host/billing/status", { cache: "no-store" });
        const j = (await res.json()) as { kind?: string };
        if (j.kind === "paid") {
          clearInterval(iv);
          setWaiting(false);
          setDone(true);
          router.replace("/dashboard/billing");
          router.refresh();
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [waiting, router]);

  const errText = (code: string) => d[`billErr_${code}`] ?? t.errorGeneric;

  async function subscribe() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/host/billing/checkout", { method: "POST" });
      const j = (await res.json()) as { url?: string; error?: string };
      if (res.ok && j.url) {
        window.location.assign(j.url);
        return;
      }
      setError(errText(j.error ?? ""));
    } catch {
      setError(t.errorGeneric);
    }
    setBusy(false);
  }

  async function cancel(undo: boolean) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/host/billing/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(undo ? { undo: true } : {}) });
    if (!res.ok) setError(errText(((await res.json().catch(() => ({}))) as { error?: string }).error ?? ""));
    setConfirmCancel(false);
    setBusy(false);
    router.refresh();
  }

  const a = p.access;
  const live = p.sub && ["active", "past_due", "paused"].includes(p.sub.status);
  // A live subscription (even with cancellation requested) must not be paid twice: "Keep my subscription" undoes a cancel.
  const showSubscribe = a.kind !== "comp" && !live;

  const status = {
    paid: { title: t.billStatusPaid, body: fmt(t.billPaidUntil, { date: date(a.until) }), cls: "bg-emerald-50 border-emerald-200", icon: <Crown className="w-5 h-5 text-emerald-700" aria-hidden /> },
    trial: { title: t.billStatusTrial, body: fmt(t.billTrialUntil, { date: date(a.until) }), cls: "bg-amber-50 border-amber-200", icon: <Crown className="w-5 h-5 text-amber-700" aria-hidden /> },
    comp: { title: t.billStatusComp, body: "", cls: "bg-emerald-50 border-emerald-200", icon: <Crown className="w-5 h-5 text-emerald-700" aria-hidden /> },
    free: {
      title: t.billStatusFree,
      body: [p.trialEnded ? t.billTrialOver : "", fmt(t.billFreeBody, { limit: p.freeLimit })].filter(Boolean).join(" "),
      cls: "bg-white border-line",
      icon: <Crown className="w-5 h-5 text-stone-400" aria-hidden />,
    },
  }[a.kind];

  return (
    <main className="flex-1 max-w-3xl w-full mx-auto px-3 sm:px-6 py-6 space-y-5">
      <div>
        <h1 className="display text-2xl font-bold">{t.billTitle}</h1>
        <p className="text-sm text-stone-500 mt-1">{t.billSub}</p>
      </div>

      {p.checkout === "cancelled" && <Note tone="info">{t.billCheckoutCancelled}</Note>}
      {waiting && (
        <Note tone="info">
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
            {waitedLong ? t.billCheckoutWaitLong : t.billCheckoutWait}
          </span>
        </Note>
      )}
      {done && <Note tone="good">{t.billCheckoutDone}</Note>}
      {error && <Note tone="warn">{error}</Note>}

      <section className={`rounded-2xl border p-4 sm:p-5 flex gap-3 ${status.cls}`}>
        {status.icon}
        <div>
          <h2 className="font-extrabold">{status.title}</h2>
          {status.body && <p className="text-sm text-stone-700 mt-0.5">{status.body}</p>}
        </div>
      </section>

      {p.sub && p.sub.status !== "pending" && (
        <section className="bg-white rounded-2xl border border-line p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-extrabold">{t.billSubStatus}</h2>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                p.sub.status === "active" ? "bg-emerald-100 text-emerald-800" : p.sub.status === "past_due" ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-700"
              }`}
            >
              {p.sub.status === "past_due" && <AlertTriangle className="inline w-3.5 h-3.5 me-1 -mt-0.5" aria-hidden />}
              {d[`billSt_${p.sub.status}`] ?? p.sub.status}
            </span>
          </div>
          {live && p.sub.provider === "safepay" && !p.sub.cancelRequestedAt && p.sub.currentPeriodEnd && (
            <p className="text-sm text-stone-600">{fmt(t.billRenews, { date: date(p.sub.currentPeriodEnd) })}</p>
          )}
          {live && p.sub.provider === "safepay" && p.isOwner && (
            <div className="pt-1">
              {p.sub.cancelRequestedAt ? (
                <div className="space-y-2">
                  <p className="text-sm text-stone-700">{fmt(t.billCancelRequested, { date: date(a.until) })}</p>
                  <button type="button" disabled={busy} onClick={() => cancel(true)} className="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-line hover:bg-stone-50 disabled:opacity-60">
                    {t.billUndoCancel}
                  </button>
                </div>
              ) : confirmCancel ? (
                <div className="space-y-2">
                  <p className="text-sm text-stone-700">{fmt(t.billCancelConfirm, { date: date(a.until) })}</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => cancel(false)} className="px-3 py-2 rounded-xl text-xs font-bold bg-red-700 text-white hover:bg-red-800 disabled:opacity-60">
                      {t.billCancelYes}
                    </button>
                    <button type="button" onClick={() => setConfirmCancel(false)} className="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-line hover:bg-stone-50">
                      {t.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmCancel(true)} className="text-xs font-bold text-stone-500 hover:text-red-700 underline">
                  {t.billCancel}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {showSubscribe && !waiting && (
        <section className="bg-ink text-cream rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <Crown className="w-5 h-5 text-gold" aria-hidden />
                {t.billPlanName}
              </h2>
              <ul className="mt-2 space-y-1 text-sm text-stone-300">
                {[t.proF1, t.proF2, t.proF3].map((f) => (
                  <li key={f} className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-gold shrink-0 mt-0.5" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-end">
              <span className="block text-3xl font-extrabold text-gold ltr">{money(p.price.amount, p.price.currency)}</span>
              <span className="text-xs text-stone-400">{t.billPerMonth}</span>
            </p>
          </div>
          {p.taxNote && <p className="text-[11px] text-stone-400">{p.taxNote}</p>}

          {!p.isOwner ? (
            <p className="text-sm text-stone-300">{t.billOwnerOnly}</p>
          ) : p.canPayOnline ? (
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy}
                onClick={subscribe}
                className="w-full py-3 rounded-xl bg-ember hover:bg-ember-dark text-white text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CreditCard className="w-4 h-4" aria-hidden />}
                {t.billSubscribeCard}
              </button>
              <p className="text-[11px] text-stone-400">{t.billSafepayNote}</p>
            </div>
          ) : (
            <div className="rounded-xl bg-ink-2 border border-stone-700 p-3.5 space-y-1">
              <p className="font-bold text-sm text-white flex items-center gap-2">
                <Landmark className="w-4 h-4 text-gold" aria-hidden />
                {t.billManualTitle}
              </p>
              <p className="text-xs text-stone-300">{t.billManualBody}</p>
              <p className="text-xs text-gold font-bold">
                {p.contact ? (
                  <>
                    {t.billContact.replace("{c}", "").trim()} <bdi dir="ltr">{p.contact}</bdi>
                  </>
                ) : (
                  t.billNoContact
                )}
              </p>
            </div>
          )}
        </section>
      )}

      <section className="bg-white rounded-2xl border border-line p-4 sm:p-5">
        <h2 className="font-extrabold flex items-center gap-2">
          <FileText className="w-4 h-4 text-stone-500" aria-hidden />
          {t.billInvoices}
        </h2>
        {p.invoices.length === 0 ? (
          <p className="text-sm text-stone-500 mt-3">{t.billNoInvoices}</p>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-[11px] text-stone-500">
                  <th className="text-start font-semibold pb-2 pe-3">{t.billColNumber}</th>
                  <th className="text-start font-semibold pb-2 pe-3">{t.billColDate}</th>
                  <th className="text-start font-semibold pb-2 pe-3">{t.billColPeriod}</th>
                  <th className="text-end font-semibold pb-2 pe-3">{t.billColAmount}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.invoices.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="py-2 pe-3 font-mono text-xs ltr">{i.number}</td>
                    <td className="py-2 pe-3">{date(i.issuedAt)}</td>
                    <td className="py-2 pe-3 text-xs text-stone-600">
                      {date(i.periodStart)} – {date(i.periodEnd)}
                    </td>
                    <td className="py-2 pe-3 text-end ltr">{money(i.total, i.currency)}</td>
                    <td className="py-2 text-end">
                      <Link href={`/dashboard/billing/invoices/${i.id}`} className="text-xs font-bold text-ember hover:underline">
                        {t.billView}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Note({ tone, children }: { tone: "info" | "good" | "warn"; children: React.ReactNode }) {
  const cls = { info: "bg-sky-50 border-sky-200 text-sky-900", good: "bg-emerald-50 border-emerald-200 text-emerald-900", warn: "bg-red-50 border-red-200 text-red-900" }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
