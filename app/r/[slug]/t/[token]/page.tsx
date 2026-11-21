import { notFound } from "next/navigation";
import { LocaleRoot } from "@/components/LocaleRoot";
import { TicketLive } from "@/components/guest/TicketLive";
import { dict } from "@/lib/i18n";
import { guestLocale } from "@/lib/locale";
import { ticketSnapshot } from "@/lib/queue";

export default async function TicketPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const snap = ticketSnapshot(token);
  if (!snap || snap.restaurant.slug !== slug) notFound();
  const locale = await guestLocale(snap.restaurant.country);
  return (
    <LocaleRoot locale={locale}>
      <TicketLive t={dict(locale)} locale={locale} token={token} initial={snap} />
    </LocaleRoot>
  );
}
