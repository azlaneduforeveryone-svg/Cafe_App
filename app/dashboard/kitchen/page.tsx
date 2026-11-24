import { HostTopBar } from "@/components/HostTopBar";
import { LocaleRoot } from "@/components/LocaleRoot";
import { KitchenView } from "@/components/host/KitchenView";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/auth";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import { kitchenSnapshot } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const { staff, restaurant } = await requireStaff("kitchen.view");
  const locale = await hostLocale();
  const t = dict(locale);
  return (
    <LocaleRoot locale={locale} className="bg-[#0F1115]">
      <HostTopBar t={t} locale={locale} restaurant={restaurant} active="kitchen" />
      <KitchenView t={t} locale={locale} initial={await kitchenSnapshot(restaurant)} canAct={can(staff.role, "kitchen.act")} />
    </LocaleRoot>
  );
}
