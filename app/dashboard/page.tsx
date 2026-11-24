import { HostTopBar } from "@/components/HostTopBar";
import { LocaleRoot } from "@/components/LocaleRoot";
import { HostDashboard } from "@/components/host/HostDashboard";
import { requireStaff } from "@/lib/auth";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import { hostSnapshot } from "@/lib/queue";

export default async function DashboardPage() {
  const { staff, restaurant } = await requireStaff("queue.view");
  const locale = await hostLocale();
  const t = dict(locale);
  return (
    <LocaleRoot locale={locale}>
      <HostTopBar t={t} locale={locale} restaurant={restaurant} active="queue" />
      <HostDashboard t={t} locale={locale} initial={await hostSnapshot(restaurant)} role={staff.role} />
    </LocaleRoot>
  );
}
