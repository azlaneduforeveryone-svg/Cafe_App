import { HostTopBar } from "@/components/HostTopBar";
import { LocaleRoot } from "@/components/LocaleRoot";
import { MenuEditor } from "@/components/host/MenuEditor";
import { requireStaff } from "@/lib/auth";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import { getMenu } from "@/lib/menu";

export default async function MenuPage() {
  const { restaurant } = await requireStaff();
  const locale = await hostLocale();
  const t = dict(locale);
  return (
    <LocaleRoot locale={locale}>
      <HostTopBar t={t} locale={locale} restaurant={restaurant} active="menu" />
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-6 space-y-4">
        <div>
          <h1 className="display text-2xl font-bold">{t.menuTitle}</h1>
          <p className="text-sm text-stone-500 mt-1">{t.menuSub}</p>
        </div>
        <MenuEditor t={t} locale={locale} initial={await getMenu(restaurant, { includeHidden: true })} />
      </main>
    </LocaleRoot>
  );
}
