import { HostTopBar } from "@/components/HostTopBar";
import { LocaleRoot } from "@/components/LocaleRoot";
import { LoyaltyAdmin } from "@/components/host/LoyaltyAdmin";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import { listMembers, listRewards, loyaltyStats } from "@/lib/loyalty";
import { currencyOf } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function LoyaltyPage() {
  const { staff, restaurant } = await requireStaff("loyalty.manage");
  const locale = await hostLocale();
  const t = dict(locale);
  const owner = can(staff.role, "loyalty.manage");
  const seesMembers = can(staff.role, "loyalty.members");
  const [rewards, members, stats] = await Promise.all([
    listRewards(restaurant.id),
    seesMembers ? listMembers(restaurant, "") : Promise.resolve({ members: [], total: 0 }),
    loyaltyStats(restaurant.id),
  ]);
  return (
    <LocaleRoot locale={locale}>
      <HostTopBar t={t} locale={locale} restaurant={restaurant} active="loyalty" />
      <LoyaltyAdmin
        t={t}
        locale={locale}
        owner={owner}
        isPro={restaurant.plan === "pro"}
        currency={currencyOf(restaurant)}
        settings={restaurant.loyalty}
        initialRewards={rewards}
        initialMembers={members}
        stats={stats}
      />
    </LocaleRoot>
  );
}
