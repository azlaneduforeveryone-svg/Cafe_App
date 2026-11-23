import { notFound } from "next/navigation";
import { LocaleRoot } from "@/components/LocaleRoot";
import { TableGuest } from "@/components/guest/TableGuest";
import { dict } from "@/lib/i18n";
import { guestLocale } from "@/lib/locale";
import { guestSessionAny, guestSnapshot } from "@/lib/tables";

export const dynamic = "force-dynamic";

/** Guest view of a table. Ordering needs the session cookie set by scanning the table's QR code. */
export default async function TablePage({ params }: { params: Promise<{ slug: string; tableId: string }> }) {
  const { slug, tableId } = await params;
  const session = await guestSessionAny(tableId);
  const snap = await guestSnapshot(tableId, session);
  if (!snap || snap.restaurant.slug !== slug) notFound();
  const locale = await guestLocale(snap.restaurant.country);
  return (
    <LocaleRoot locale={locale}>
      <TableGuest t={dict(locale)} locale={locale} initial={snap} />
    </LocaleRoot>
  );
}
