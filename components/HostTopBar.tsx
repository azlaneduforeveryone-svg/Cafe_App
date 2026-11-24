import Link from "next/link";
import { BarChart3, BookOpen, ChefHat, Crown, Gift, LayoutGrid, LayoutList, Settings, Zap } from "lucide-react";
import { Brand } from "./Brand";
import { LangSwitch } from "./LangSwitch";
import { LogoutButton } from "./LogoutButton";
import { HOST_COOKIE } from "@/lib/locale";
import { FREE_LIMIT, alertsUsedNow } from "@/lib/queue";
import { restaurantName } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { Locale, Restaurant } from "@/lib/types";

export function HostTopBar({ t, locale, restaurant, active }: { t: Dict; locale: Locale; restaurant: Restaurant; active: "queue" | "floor" | "kitchen" | "menu" | "loyalty" | "reports" | "settings" | "plans" }) {
  const alertsUsed = alertsUsedNow(restaurant);
  const nav = [
    { key: "queue", href: "/dashboard", label: t.dashboard, Icon: LayoutList },
    { key: "floor", href: "/dashboard/floor", label: t.floorNav, Icon: LayoutGrid },
    { key: "kitchen", href: "/dashboard/kitchen", label: t.kitchenNav, Icon: ChefHat },
    { key: "menu", href: "/dashboard/menu", label: t.menuNav, Icon: BookOpen },
    { key: "loyalty", href: "/dashboard/loyalty", label: t.loyaltyNav, Icon: Gift },
    { key: "reports", href: "/dashboard/reports", label: t.reportsNav, Icon: BarChart3 },
    { key: "settings", href: "/dashboard/settings", label: t.settings, Icon: Settings },
    { key: "plans", href: "/dashboard/billing", label: t.plans, Icon: Crown },
  ] as const;
  const atLimit = restaurant.plan === "free" && alertsUsed >= FREE_LIMIT;

  return (
    <header className="no-print sticky top-0 z-40 bg-ink text-cream border-b border-ink-2 shadow-lg">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Brand name={t.brand} href="/dashboard" />
          <span className="hidden md:inline text-xs text-stone-400 truncate max-w-48">{restaurantName(restaurant, locale)}</span>
        </div>

        <nav className="flex items-center bg-ink-2 p-1 rounded-xl border border-stone-700/70">
          {nav.map(({ key, href, label, Icon }) => (
            <Link
              key={key}
              href={href}
              aria-current={active === key ? "page" : undefined}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                active === key ? "bg-ember text-white shadow" : "text-stone-300 hover:text-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
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
              t.proUnlimited
            ) : (
              <span>
                <span className="ltr">
                  {alertsUsed}/{FREE_LIMIT}
                </span>{" "}
                {t.alertsUsed}
              </span>
            )}
          </Link>
          <LangSwitch current={locale} cookie={HOST_COOKIE} />
          <LogoutButton label={t.logout} />
        </div>
      </div>
    </header>
  );
}
