import { notFound } from "next/navigation";
import { LocaleRoot } from "@/components/LocaleRoot";
import { GuestFrame } from "@/components/guest/GuestFrame";
import { JoinForm } from "@/components/guest/JoinForm";
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
  const { eta, waiting } = await joinInfo(r);

  return (
    <LocaleRoot locale={locale}>
      <GuestFrame t={t} locale={locale} restaurant={restaurant} nowServing={r.nowServing}>
        <JoinForm t={t} locale={locale} restaurant={restaurant} eta={eta} waiting={waiting} />
      </GuestFrame>
    </LocaleRoot>
  );
}
