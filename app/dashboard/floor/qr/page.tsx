import QRCode from "qrcode";
import Link from "next/link";
import { LocaleRoot } from "@/components/LocaleRoot";
import { PrintButton } from "@/components/PrintButton";
import { requireStaff } from "@/lib/auth";
import { restaurantName } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { hostLocale, siteOrigin } from "@/lib/locale";
import { listTables, tableQrUrl } from "@/lib/tables";

export const dynamic = "force-dynamic";

/** One QR card per table, ready to print and stick on the tables. Staff only. */
export default async function TableQrSheet() {
  const { restaurant } = await requireStaff();
  const locale = await hostLocale();
  const t = dict(locale);
  const origin = await siteOrigin();
  const tables = await listTables(restaurant);
  const cards = await Promise.all(
    tables.map(async (tb) => ({
      tb,
      svg: await QRCode.toString(tableQrUrl(origin, tb), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1c1917", light: "#ffffff" } }),
    })),
  );
  return (
    <LocaleRoot locale={locale}>
      <main className="max-w-5xl w-full mx-auto p-6 space-y-4">
        <div className="no-print flex items-center justify-between gap-2">
          <Link href="/dashboard/floor" className="text-sm font-bold text-ember hover:underline">
            {t.floorTitle}
          </Link>
          <PrintButton label={t.printQr} />
        </div>
        <h1 className="no-print display text-2xl font-bold">{t.qrSheetTitle}</h1>
        {cards.length === 0 && <p className="text-sm text-stone-500">{t.noTablesYet}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 print:gap-6">
          {cards.map(({ tb, svg }) => (
            <div key={tb.id} className="bg-white rounded-2xl border border-line p-4 text-center break-inside-avoid">
              <p className="text-xs font-bold text-stone-500">{restaurantName(restaurant, locale)}</p>
              <p className="display text-3xl font-extrabold mt-1">{tb.number}</p>
              <div className="mx-auto mt-2 w-40 h-40 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
              <p className="text-[11px] text-stone-600 mt-2">{t.qrSheetHint}</p>
            </div>
          ))}
        </div>
      </main>
    </LocaleRoot>
  );
}
