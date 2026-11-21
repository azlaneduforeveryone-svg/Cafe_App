import QRCode from "qrcode";
import { HostTopBar } from "@/components/HostTopBar";
import { LocaleRoot } from "@/components/LocaleRoot";
import { PrintButton } from "@/components/host/PrintButton";
import { SettingsForm } from "@/components/host/SettingsForm";
import { requireStaff } from "@/lib/auth";
import { restaurantName } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { hostLocale, siteOrigin } from "@/lib/locale";

export default async function SettingsPage() {
  const { restaurant: r } = await requireStaff();
  const locale = await hostLocale();
  const t = dict(locale);
  const origin = await siteOrigin();
  const guestUrl = `${origin}/r/${r.slug}`;
  const isLocal = /localhost|127\.0\.0\.1/.test(origin);
  const svg = await QRCode.toString(guestUrl, { type: "svg", margin: 1, color: { dark: "#1c1917", light: "#ffffff" } });

  return (
    <LocaleRoot locale={locale}>
      <HostTopBar t={t} locale={locale} restaurant={r} active="settings" />
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-6 grid gap-6 lg:grid-cols-12 items-start">
        <div className="lg:col-span-7 no-print">
          <h1 className="display text-2xl font-bold mb-4">{t.settingsTitle}</h1>
          <SettingsForm
            t={t}
            initial={{
              name: r.name,
              nameAr: r.nameAr,
              nameUr: r.nameUr,
              sections: r.sections,
              gracePeriodMin: r.gracePeriodMin,
              minutesPerParty: r.minutesPerParty,
            }}
          />
        </div>

        {/* Printable QR card: only this prints */}
        <section className="lg:col-span-5 space-y-3">
          <div className="bg-white rounded-3xl border-2 border-gold shadow-xl p-6 text-center">
            <p className="text-[11px] uppercase tracking-widest font-bold text-ember">{t.qrTitle}</p>
            <h2 className="display text-2xl font-bold mt-1">{restaurantName(r, locale)}</h2>
            <div className="mx-auto my-4 w-56 h-56 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="font-extrabold text-sm">{t.joinTitle}</p>
            <p className="text-xs text-stone-500" lang="ar" dir="rtl">
              انضم إلى قائمة الانتظار
            </p>
            <p className="text-xs text-stone-500" lang="ur" dir="rtl">
              ویٹ لسٹ میں شامل ہوں
            </p>
            <p className="mt-3 text-[11px] font-mono text-stone-500 break-all ltr">{guestUrl}</p>
          </div>
          <div className="flex flex-wrap gap-2 no-print">
            <PrintButton label={t.printQr} />
            <a href={guestUrl} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-xl bg-cream border border-line hover:border-stone-400 text-ink text-xs font-bold">
              {t.openGuestPage}
            </a>
          </div>
          <p className="text-xs text-stone-500 no-print">{t.qrBody}</p>
          {isLocal && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 no-print">{t.qrLocalTip}</p>}
        </section>
      </main>
    </LocaleRoot>
  );
}
