import Link from "next/link";
import { LocaleRoot } from "@/components/LocaleRoot";
import { KitchenView } from "@/components/host/KitchenView";
import { dict } from "@/lib/i18n";
import { deviceSnapshot, getDevice } from "@/lib/kitchenDevice";
import { hostLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

/** Locked kitchen display: tickets, Ready, Out of stock. Nothing else is reachable from here. */
export default async function KitchenDisplayPage() {
  const locale = await hostLocale();
  const t = dict(locale);
  const d = await getDevice();
  if (!d) {
    return (
      <LocaleRoot locale={locale} className="bg-[#0F1115] text-stone-100 items-center justify-center p-6 text-center gap-3">
        <h1 className="text-2xl font-extrabold">{t.kdNotSetUp}</h1>
        <p className="text-stone-400 max-w-md">{t.kdNotSetUpHelp}</p>
        <Link href="/login?next=/dashboard/kitchen" className="px-5 py-3 rounded-xl bg-ember text-white font-extrabold">
          {t.login}
        </Link>
      </LocaleRoot>
    );
  }
  return (
    <LocaleRoot locale={locale}>
      <KitchenView t={t} locale={locale} initial={await deviceSnapshot(d)} mode="device" />
    </LocaleRoot>
  );
}
