import { HostTopBar } from "@/components/HostTopBar";
import { LocaleRoot } from "@/components/LocaleRoot";
import { StaffAdmin } from "@/components/host/StaffAdmin";
import { listActivity } from "@/lib/activity";
import { requireStaff } from "@/lib/auth";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import { currencyOf } from "@/lib/menu";
import { can } from "@/lib/permissions";
import { listStaff } from "@/lib/staff";
import { listDevices } from "@/lib/kitchenDevice";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const ctx = await requireStaff("staff.manage");
  const locale = await hostLocale();
  const t = dict(locale);
  const [team, activity, devices] = await Promise.all([
    listStaff(ctx),
    can(ctx.staff.role, "activity.view") ? listActivity(ctx.restaurant.id) : Promise.resolve([]),
    can(ctx.staff.role, "kitchen.device") ? listDevices(ctx.restaurant.id) : Promise.resolve([]),
  ]);
  return (
    <LocaleRoot locale={locale}>
      <HostTopBar t={t} locale={locale} restaurant={ctx.restaurant} active="staff" />
      <StaffAdmin
        t={t}
        locale={locale}
        myRole={ctx.staff.role}
        isPro={ctx.restaurant.plan === "pro"}
        currency={currencyOf(ctx.restaurant)}
        waiterScope={ctx.restaurant.waiterScope}
        initial={team}
        activity={activity}
        devices={devices}
      />
    </LocaleRoot>
  );
}
