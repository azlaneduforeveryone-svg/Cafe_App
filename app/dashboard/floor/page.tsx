import { HostTopBar } from "@/components/HostTopBar";
import { LocaleRoot } from "@/components/LocaleRoot";
import { FloorView } from "@/components/host/FloorView";
import { requireStaff } from "@/lib/auth";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import { floorSnapshot } from "@/lib/tables";

export const dynamic = "force-dynamic";

export default async function FloorPage() {
  const { restaurant } = await requireStaff();
  const locale = await hostLocale();
  const t = dict(locale);
  return (
    <LocaleRoot locale={locale}>
      <HostTopBar t={t} locale={locale} restaurant={restaurant} active="floor" />
      <FloorView t={t} locale={locale} initial={await floorSnapshot(restaurant)} />
    </LocaleRoot>
  );
}
