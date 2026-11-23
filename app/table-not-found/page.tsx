import { QrCode } from "lucide-react";
import { LocaleRoot } from "@/components/LocaleRoot";
import { dict } from "@/lib/i18n";
import { guestLocale } from "@/lib/locale";

export default async function TableNotFound() {
  const locale = await guestLocale("SA");
  const t = dict(locale);
  return (
    <LocaleRoot locale={locale}>
      <main className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-8 bg-cream">
        <span className="w-16 h-16 rounded-full bg-white border border-line flex items-center justify-center shadow-sm">
          <QrCode className="w-7 h-7 text-ember" aria-hidden />
        </span>
        <h1 className="display text-2xl font-bold">{t.tableNotFoundTitle}</h1>
        <p className="text-sm text-stone-600 max-w-xs">{t.tableNotFoundBody}</p>
      </main>
    </LocaleRoot>
  );
}
