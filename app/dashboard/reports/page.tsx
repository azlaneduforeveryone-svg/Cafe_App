import { HostTopBar } from "@/components/HostTopBar";
import { LocaleRoot } from "@/components/LocaleRoot";
import { ReportView } from "@/components/host/ReportView";
import { requireStaff } from "@/lib/auth";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import { buildAlerts, buildReport, businessToday, parseRange } from "@/lib/reports";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { restaurant: r } = await requireStaff();
  const locale = await hostLocale();
  const t = dict(locale);
  const range = parseRange(r.country, await searchParams);
  const [rep, alerts] = await Promise.all([buildReport(r, range), buildAlerts(r)]);
  return (
    <LocaleRoot locale={locale}>
      <HostTopBar t={t} locale={locale} restaurant={r} active="reports" />
      <ReportView t={t} locale={locale} rep={rep} alerts={alerts} today={businessToday(r.country)} />
    </LocaleRoot>
  );
}
