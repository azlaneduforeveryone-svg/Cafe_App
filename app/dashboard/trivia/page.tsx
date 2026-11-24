import { HostTopBar } from "@/components/HostTopBar";
import { LocaleRoot } from "@/components/LocaleRoot";
import { TriviaAdmin } from "@/components/host/TriviaAdmin";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import { listHouseQuestions, triviaStats } from "@/lib/trivia";

export const dynamic = "force-dynamic";

export default async function TriviaPage() {
  const { staff, restaurant } = await requireStaff("trivia.manage");
  const locale = await hostLocale();
  const t = dict(locale);
  const [questions, stats] = await Promise.all([listHouseQuestions(restaurant.id), triviaStats(restaurant)]);
  return (
    <LocaleRoot locale={locale}>
      <HostTopBar t={t} locale={locale} restaurant={restaurant} active="trivia" />
      <TriviaAdmin t={t} locale={locale} owner={can(staff.role, "trivia.manage")} on={restaurant.triviaOn} initialQuestions={questions} stats={stats} />
    </LocaleRoot>
  );
}
