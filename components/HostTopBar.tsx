import Link from "next/link";
import { BarChart3, BookOpen, Brain, ChefHat, Crown, Gift, UserCog, LayoutGrid, LayoutList, Settings, Zap } from "lucide-react";
import { Brand } from "./Brand";
import { LangSwitch } from "./LangSwitch";
import { LogoutButton } from "./LogoutButton";
import { HOST_COOKIE } from "@/lib/locale";
import { FREE_LIMIT, alertsUsedNow } from "@/lib/queue";
import { fmt, restaurantName } from "@/lib/format";
import { getStaff } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import type { Dict } from "@/lib/i18n";
import type { Locale, Restaurant } from "@/lib/types";

export async function HostTopBar({
  t,
  locale,
  restaurant,
  active,
}: {
  t: Dict;
  locale: Locale;
  restaurant: Restaurant;
  active: "queue" | "floor" | "kitchen" | "menu" | "loyalty" | "trivia" | "reports" | "staff" | "settings" | "plans";
}) {
  const alertsUsed = alertsUsedNow(restaurant);
  const role = (await getStaff())?.staff.role;
  const may = (p: Permission) => can(role, p);
  const all = [
    { key: "queue", href: "/dashboard", label: t.dashboard, Icon: LayoutList, perm: "queue.view" },
    { key: "floor", href: "/dashboard/floor", label: t.floorNav, Icon: LayoutGrid, perm: "floor.view" },
    { key: "kitchen", href: "/dashboard/kitchen", label: t.kitchenNav, Icon: ChefHat, perm: "kitchen.view" },
    { key: "menu", href: "/dashboard/menu", label: t.menuNav, Icon: BookOpen, perm: "menu.edit" },
    { key: "loyalty", href: "/dashboard/loyalty", label: t.loyaltyNav, Icon: Gift, perm: "loyalty.manage" },
    { key: "trivia", href: "/dashboard/trivia", label: t.triviaNav, Icon: Brain, perm: "trivia.manage" },
    { key: "reports", href: "/dashboard/reports", label: t.reportsNav, Icon: BarChart3, perm: "reports.view" },
    { key: "staff", href: "/dashboard/staff", label: t.staffNav, Icon: UserCog, perm: "staff.manage" },
    { key: "settings", href: "/dashboard/settings", label: t.settings, Icon: Settings, perm: "settings.manage" },
    { key: "plans", href: "/dashboard/billing", label: t.plans, Icon: Crown, perm: "billing.manage" },
  ] as const;
  const nav = all.filter((n) => may(n.perm));
  const atLimit = restaurant.plan === "free" && alertsUsed >= FREE_LIMIT;
  // On a free trial (not paid, not set to Pro by hand): show the days left, not "unlimited".
  const trialDays = trialDaysLeft(restaurant);

  return (
    <header className="no-print sticky top-0 z-40 bg-ink text-cream border-b border-ink-2 shadow-lg">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Brand name={t.brand} href="/dashboard" />
          <span className="hidden md:inline text-xs text-stone-400 truncate max-w-48">{restaurantName(restaurant, locale)}</span>
        </div>

        <nav className="flex items-center bg-ink-2 p-1 rounded-xl border border-stone-700/70 max-w-full overflow-x-auto">
          {nav.map(({ key, href, label, Icon }) => (
            <Link
              key={key}
              href={href}
              aria-current={active === key ? "page" : undefined}
              aria-label={label}
              title={label}
              className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                active === key ? "bg-ember text-white shadow" : "text-stone-300 hover:text-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden />
              {/* Tablets show icons (with the current page named); wide screens show every label. */}
              <span className={active === key ? "hidden sm:inline" : "hidden xl:inline"}>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {may("billing.manage") && (
          <Link
            href="/dashboard/billing"
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
              restaurant.plan === "pro"
                ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-300"
                : atLimit
                  ? "bg-red-950 border-red-500 text-red-200"
                  : "bg-amber-950/60 border-gold/40 text-gold"
            }`}
          >
            <Zap className="w-3.5 h-3.5" aria-hidden />
            {restaurant.plan === "pro" ? (
              trialDays !== null ? (
                fmt(trialDays === 1 ? t.proTrialOneDay : t.proTrialDays, { n: trialDays })
              ) : (
                t.proUnlimited
              )
            ) : (
              <span>
                <span className="ltr">
                  {alertsUsed}/{FREE_LIMIT}
                </span>{" "}
                {t.alertsUsed}
              </span>
            )}
          </Link>
          )}
          <LangSwitch current={locale} cookie={HOST_COOKIE} />
          <LogoutButton label={t.logout} />
        </div>
      </div>
    </header>
  );
}

/** Whole days left of a free Pro trial, or null if this restaurant isn't on one. */
function trialDaysLeft(r: Restaurant): number | null {
  const now = Date.now();
  if (r.basePlan === "pro" || (r.proUntil && r.proUntil > now) || !r.trialEndsAt || r.trialEndsAt <= now) return null;
  return Math.max(1, Math.ceil((r.trialEndsAt - now) / 86_400_000));
}
