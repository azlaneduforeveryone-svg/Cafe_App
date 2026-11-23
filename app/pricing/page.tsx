import Link from "next/link";
import { Check, CheckCircle2, Crown, MessageSquare, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/Brand";
import { HostTopBar } from "@/components/HostTopBar";
import { LangSwitch } from "@/components/LangSwitch";
import { LocaleRoot } from "@/components/LocaleRoot";
import { PlanButton } from "@/components/host/PlanButton";
import { getStaff } from "@/lib/auth";
import { fmt } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { HOST_COOKIE, hostLocale } from "@/lib/locale";
import { PRICING, money } from "@/lib/pricing";
import { FREE_LIMIT } from "@/lib/queue";
import type { Country } from "@/lib/types";

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  const { region: q } = await searchParams;
  const locale = await hostLocale();
  const t = dict(locale);
  const ctx = await getStaff();
  const region: Country = q === "SA" || q === "PK" ? q : ctx?.restaurant.country ?? (locale === "ar" ? "SA" : "PK");
  const p = PRICING[region];
  const plan = ctx?.restaurant.plan;
  const testMode = process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_UPGRADE === "1";

  return (
    <LocaleRoot locale={locale}>
      {ctx ? (
        <HostTopBar t={t} locale={locale} restaurant={ctx.restaurant} active="plans" />
      ) : (
        <header className="bg-ink">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <Brand name={t.brand} />
            <div className="flex items-center gap-2">
              <LangSwitch current={locale} cookie={HOST_COOKIE} />
              <Link href="/signup" className="px-3.5 py-2 rounded-xl bg-ember text-white text-xs font-extrabold">
                {t.signup}
              </Link>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="text-center space-y-3">
          <h1 className="display text-3xl sm:text-4xl font-bold">{t.plansTitle}</h1>
          <p className="text-stone-600">{t.plansSub}</p>
          <div className="inline-flex items-center gap-2 text-xs font-bold">
            <span className="text-stone-500">{t.region}:</span>
            <div className="flex bg-white border border-line rounded-lg p-0.5">
              {(["SA", "PK"] as const).map((c) => (
                <Link
                  key={c}
                  href={`/pricing?region=${c}`}
                  aria-current={c === region ? "true" : undefined}
                  className={`px-3 py-1 rounded-md ${c === region ? "bg-ink text-white" : "text-stone-600 hover:text-ink"}`}
                >
                  {c === "SA" ? t.countrySA : t.countryPK}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Free */}
          <div className="bg-white rounded-3xl p-6 border border-line shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-extrabold">{t.freeName}</h2>
                {plan === "free" && <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-stone-100 text-stone-700">{t.currentPlan}</span>}
              </div>
              <p className="text-3xl font-extrabold">
                <span className="ltr">{money(0, p.currency)}</span> <span className="text-xs text-stone-500 font-bold">{t.perMonth}</span>
              </p>
              <ul className="mt-5 space-y-3 text-sm text-stone-700">
                {[fmt(t.freeF1, { limit: FREE_LIMIT }), t.freeF2, t.freeF3].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            {!ctx && (
              <Link href="/signup" className="mt-6 w-full py-3 rounded-xl bg-ink text-white text-sm font-bold text-center">
                {t.signup}
              </Link>
            )}
          </div>

          {/* Pro */}
          <div className="bg-ink text-cream rounded-3xl p-6 border-2 border-gold shadow-xl flex flex-col justify-between relative overflow-hidden">
            <span className="absolute top-0 end-0 bg-gold text-ink text-[10px] font-extrabold px-3 py-1 rounded-es-xl uppercase tracking-wider">{t.mostPopular}</span>
            <div>
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-gold" aria-hidden />
                <h2 className="text-2xl font-extrabold text-white">{t.proName}</h2>
              </div>
              <p className="mt-3">
                <span className="text-3xl font-extrabold text-gold ltr">{money(p.pro, p.currency)}</span> <span className="text-xs text-stone-400">{t.perMonth}</span>
              </p>
              <ul className="mt-5 space-y-3 text-sm text-stone-200">
                {[t.proF1, t.proF2, t.proF3].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-gold shrink-0 mt-0.5" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 space-y-2">
              {plan === "pro" ? (
                <span className="block w-full py-3 rounded-xl bg-emerald-900/60 border border-emerald-500/40 text-emerald-200 text-sm font-bold text-center">{t.currentPlan}</span>
              ) : (
                <>
                  {ctx ? (
                    <Link href="/dashboard/billing" className="block w-full py-3 rounded-xl bg-ember hover:bg-ember-dark text-white text-sm font-bold text-center">
                      {t.billSubscribeCta}
                    </Link>
                  ) : (
                    <p className="text-[11px] text-stone-400 flex items-start gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                      {t.billTrialNote}
                    </p>
                  )}
                  {ctx && testMode && <PlanButton label={t.activateTest} plan="pro" subtle />}
                  {!ctx && (
                    <Link href="/signup" className="block w-full py-3 rounded-xl bg-ember hover:bg-ember-dark text-white text-sm font-bold text-center">
                      {t.signup}
                    </Link>
                  )}
                </>
              )}
              {plan === "pro" && ctx && testMode && <PlanButton label={`${t.freeName} (test)`} plan="free" subtle />}
            </div>
          </div>

          {/* WhatsApp bundles */}
          <div className="bg-white rounded-3xl p-6 border border-line shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2 gap-2">
                <h2 className="text-lg font-extrabold flex items-center gap-1.5">
                  <MessageSquare className="w-5 h-5 text-emerald-700" aria-hidden />
                  {t.bundlesTitle}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">{t.comingSoon}</span>
              </div>
              <p className="text-xs text-stone-500 mb-4">{t.bundlesBody}</p>
              <div className="space-y-3">
                {p.bundles.map((b) => (
                  <div key={b.credits} className="p-3.5 rounded-2xl border border-line bg-cream flex items-center justify-between">
                    <span className="font-bold text-sm">{fmt(t.alertsN, { n: b.credits.toLocaleString("en-US") })}</span>
                    <span className="text-xs font-extrabold text-ember ltr">{money(b.price, p.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 pt-3 border-t border-stone-100">
              <p className="text-[11px] font-bold text-stone-500 mb-1">{t.payMethods}</p>
              <p className="text-[11px] text-stone-500 ltr">{p.methods.join(" • ")}</p>
            </div>
          </div>
        </div>

        {ctx && (
          <div className="text-center">
            <Link href="/dashboard" className="text-sm font-bold text-ember hover:underline">
              {t.backToQueue}
            </Link>
          </div>
        )}
      </main>
    </LocaleRoot>
  );
}
