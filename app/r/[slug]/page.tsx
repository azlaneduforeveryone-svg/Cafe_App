import { notFound } from "next/navigation";
import { LocaleRoot } from "@/components/LocaleRoot";
import { GuestFrame } from "@/components/guest/GuestFrame";
import { DemoLinks } from "@/components/guest/DemoLinks";
import { JoinForm } from "@/components/guest/JoinForm";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";
import { demoLinks } from "@/lib/demoLinks";
import { dict } from "@/lib/i18n";
import { guestLocale } from "@/lib/locale";
import { getRestaurantBySlug, joinInfo, toPublic } from "@/lib/queue";

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getRestaurantBySlug(slug);
  if (!r) notFound();
  const locale = await guestLocale(r.country);
  const t = dict(locale);
  const restaurant = toPublic(r);
  const [{ eta, waiting }, demo] = await Promise.all([joinInfo(r), demoLinks(r)]);

  return (
    <LocaleRoot locale={locale}>
      <GuestFrame t={t} locale={locale} restaurant={restaurant} nowServing={r.nowServing}>
        {demo && <DemoLinks t={t} table={demo.table} email={DEMO_EMAIL} password={DEMO_PASSWORD} />}
        <JoinForm t={t} locale={locale} restaurant={restaurant} eta={eta} waiting={waiting} />
      </GuestFrame>
    </LocaleRoot>
  );
}
