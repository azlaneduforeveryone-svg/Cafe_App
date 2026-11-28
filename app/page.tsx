import Link from "next/link";
import { Bell, Clock, Globe, MessageCircle, QrCode, Smartphone, Sparkles, Timer, Users } from "lucide-react";
import { Brand } from "@/components/Brand";
import { BrandIntro } from "@/components/BrandIntro";
import { LangSwitch } from "@/components/LangSwitch";
import { LocaleRoot } from "@/components/LocaleRoot";
import { getStaff } from "@/lib/auth";
import { fmt } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { HOST_COOKIE, hostLocale } from "@/lib/locale";
import { FREE_LIMIT, getRestaurantBySlug } from "@/lib/queue";
import { ContactEmails } from "@/components/ContactEmails";
import { salesContact } from "@/lib/contact";
import { DEMO_SLUG } from "@/lib/demo";
import { LegalLinks } from "@/components/LegalLinks";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Landing() {
  const locale = await hostLocale();
  const t = dict(locale);
  const staff = await getStaff();
  const hasDemo = (await getRestaurantBySlug(DEMO_SLUG).catch(() => null)) !== null;
  const contact = salesContact();
  const waDemo = contact.whatsapp ? `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(fmt(t.demoWaMsg, { brand: t.brand }))}` : null;

  const steps = [
    { Icon: QrCode, title: t.how1Title, body: t.how1Body },
    { Icon: Smartphone, title: t.how2Title, body: t.how2Body },
    { Icon: Bell, title: t.how3Title, body: t.how3Body },
  ];
  const features = [
    { Icon: Globe, title: t.feat1Title, body: t.feat1Body },
    { Icon: Clock, title: t.feat2Title, body: t.feat2Body },
    { Icon: Users, title: t.feat3Title, body: t.feat3Body },
    { Icon: Sparkles, title: t.feat4Title, body: fmt(t.feat4Body, { limit: FREE_LIMIT }) },
  ];

  return (
    <LocaleRoot locale={locale}>
      <header className="bg-ink text-cream">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-3">
          <Brand name={t.brand} />
          <div className="flex items-center gap-2">
            <Link href="/pricing" className="whitespace-nowrap text-xs font-semibold text-stone-300 hover:text-white px-1 sm:px-2">
              {t.plans}
            </Link>
            <LangSwitch current={locale} cookie={HOST_COOKIE} />
            {staff ? (
              <Link href="/dashboard" className="px-3.5 py-2 rounded-xl bg-ember hover:bg-ember-dark text-white text-xs font-extrabold">
                {t.dashboard}
              </Link>
            ) : (
              <Link href="/login" className="whitespace-nowrap px-3 sm:px-3.5 py-2 rounded-xl bg-ink-2 border border-stone-700 hover:bg-stone-800 text-white text-xs font-bold">
                {t.login}
              </Link>
            )}
          </div>
        </div>
      </header>
      <BrandIntro label={t.brand} />

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ember/10 text-ember text-xs font-bold">
              <QrCode className="w-3.5 h-3.5" aria-hidden />
              {t.heroBadge}
            </span>
            <h1 className="display text-3xl sm:text-5xl font-bold leading-tight text-ink">{t.heroTitle}</h1>
            <p className="text-stone-600 text-base sm:text-lg max-w-xl">{t.heroSub}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="px-5 py-3.5 rounded-2xl bg-ember hover:bg-ember-dark text-white font-extrabold text-sm shadow-lg shadow-ember/25"
              >
                {t.ctaStart}
              </Link>
              {waDemo && (
                <a
                  href={waDemo}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-[#128c4b] hover:bg-[#0f7a41] text-white font-extrabold text-sm"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden />
                  {t.ctaBookDemo}
                </a>
              )}
              {hasDemo && (
                <Link
                  href={`/r/${DEMO_SLUG}`}
                  className="px-5 py-3.5 rounded-2xl bg-white border border-line hover:border-stone-400 text-ink font-bold text-sm"
                >
                  {t.ctaDemo}
                </Link>
              )}
            </div>
            {(contact.whatsapp || contact.email) && <p className="text-xs text-stone-500">{t.demoContactNote}</p>}
          </div>

          {/* Static phone preview in the demo's style */}
          <div className="lg:col-span-5 flex justify-center" aria-hidden>
            <div className="w-full max-w-[320px] bg-ink rounded-[2.5rem] p-3 shadow-2xl border-4 border-stone-800">
              <div className="w-24 h-5 bg-black rounded-full mx-auto mb-2" />
              <div className="rounded-[2rem] bg-go text-white p-6 text-center space-y-4 animate-ready-glow min-h-[440px] flex flex-col justify-center">
                <div className="w-16 h-16 rounded-full bg-white/20 mx-auto flex items-center justify-center">
                  <Bell className="w-8 h-8" />
                </div>
                <span className="inline-block mx-auto px-3 py-1 rounded-full bg-black/25 text-xs font-extrabold ltr">#104</span>
                <p className="display text-2xl font-extrabold">{t.readyTitle}</p>
                <p className="text-sm text-emerald-100">{t.readySub}</p>
                <div className="bg-black/25 rounded-2xl p-3 mx-auto border border-white/15">
                  <span className="block text-[10px] uppercase tracking-wider text-emerald-200 font-bold">{t.timeLeft}</span>
                  <span className="text-2xl font-mono font-extrabold ltr">04:52</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border-y border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
            <h2 className="display text-2xl sm:text-3xl font-bold mb-8">{t.howTitle}</h2>
            <ol className="grid md:grid-cols-3 gap-5">
              {steps.map(({ Icon, title, body }, i) => (
                <li key={title} className="p-5 rounded-3xl bg-cream border border-line">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-10 h-10 rounded-xl bg-ink text-gold flex items-center justify-center font-mono font-extrabold ltr">{i + 1}</span>
                    <Icon className="w-5 h-5 text-ember" aria-hidden />
                  </div>
                  <h3 className="font-extrabold text-base mb-1">{title}</h3>
                  <p className="text-sm text-stone-600">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <h2 className="display text-2xl sm:text-3xl font-bold mb-8">{t.featTitle}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(({ Icon, title, body }) => (
              <div key={title} className="p-5 rounded-3xl bg-white border border-line shadow-sm">
                <Icon className="w-6 h-6 text-ember mb-3" aria-hidden />
                <h3 className="font-extrabold text-sm mb-1">{title}</h3>
                <p className="text-sm text-stone-600">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 p-6 rounded-3xl bg-ink text-cream flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Timer className="w-6 h-6 text-gold" aria-hidden />
              <p className="font-bold">{t.plansSub}</p>
            </div>
            <Link href="/pricing" className="px-4 py-2.5 rounded-xl bg-gold text-ink text-sm font-extrabold">
              {t.plans}
            </Link>
          </div>
        </section>
      </main>

      <section id="contact" className="border-t border-line bg-cream">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold">{t.contactUs}</h2>
              <p className="text-sm text-stone-600">{t.contactSub}</p>
            </div>
            {contact.whatsapp && (
              <a href={`https://wa.me/${contact.whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#128c4b] hover:bg-[#0f7a41] text-white text-sm font-extrabold">
                <MessageCircle className="w-4 h-4" aria-hidden />
                <bdi dir="ltr">+{contact.whatsapp}</bdi>
              </a>
            )}
          </div>
          <ContactEmails t={t} kinds={["hello", "sales", "support"]} />
        </div>
      </section>

      <footer className="border-t border-line py-6 text-center text-xs text-stone-500">
        <LegalLinks t={t} />
        <p className="mt-2">© {new Date().getFullYear()} Table &amp; Bell</p>
      </footer>
    </LocaleRoot>
  );
}
