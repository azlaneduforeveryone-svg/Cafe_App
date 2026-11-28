import { notFound } from "next/navigation";
import { LocaleRoot } from "@/components/LocaleRoot";
import { PartyTicket } from "@/components/guest/PartyTicket";
import { dict } from "@/lib/i18n";
import { guestLocale } from "@/lib/locale";
import { partySnapshot } from "@/lib/queue";

/** The page the rest of the party opens from a shared link: follow the ticket, play trivia. */
export default async function PartyPage({ params }: { params: Promise<{ slug: string; viewToken: string }> }) {
  const { slug, viewToken } = await params;
  const snap = await partySnapshot(viewToken);
  if (!snap || snap.restaurant.slug !== slug) notFound();
  const locale = await guestLocale(snap.restaurant.country);
  return (
    <LocaleRoot locale={locale}>
      <PartyTicket t={dict(locale)} locale={locale} viewToken={viewToken} initial={snap} />
    </LocaleRoot>
  );
}
