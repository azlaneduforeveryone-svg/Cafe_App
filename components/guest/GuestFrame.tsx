import { Utensils } from "lucide-react";
import { LangSwitch } from "@/components/LangSwitch";
import { restaurantName } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { Locale, PublicRestaurant } from "@/lib/types";

/**
 * Phone-sized card. Full screen on a phone, centred on larger screens.
 * Turns green when the table is ready.
 */
export function GuestFrame({
  t,
  locale,
  restaurant,
  nowServing,
  ready = false,
  children,
}: {
  t: Dict;
  locale: Locale;
  restaurant: PublicRestaurant;
  nowServing?: number;
  ready?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex justify-center sm:items-center sm:py-8 sm:px-4 bg-cream">
      <div
        className={`w-full sm:max-w-[420px] min-h-screen sm:min-h-[680px] sm:rounded-[2.25rem] sm:shadow-2xl sm:border-[6px] sm:border-ink overflow-hidden flex flex-col transition-colors duration-500 ${
          ready ? "bg-go text-white animate-ready-glow" : "bg-cream text-ink"
        }`}
      >
        <header className={`px-5 pt-4 pb-3 flex items-center justify-between gap-3 border-b ${ready ? "border-emerald-600/60 bg-emerald-900/30" : "border-line bg-white"}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            {restaurant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logoUrl} alt="" className="w-10 h-10 rounded-xl object-contain bg-white border border-line shrink-0" />
            ) : (
              <span className="w-9 h-9 rounded-full bg-ember text-white flex items-center justify-center shadow-sm shrink-0">
                <Utensils className="w-4 h-4" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <p className="display font-bold text-sm leading-tight truncate">{restaurantName(restaurant, locale)}</p>
              {typeof nowServing === "number" && nowServing > 0 && (
                <p className={`text-[11px] ${ready ? "text-emerald-100" : "text-stone-500"}`}>
                  {t.nowServing} <span className="font-extrabold ltr">#{nowServing}</span>
                </p>
              )}
            </div>
          </div>
          <LangSwitch current={locale} cookie="tp_glang" tone="light" />
        </header>
        <div className="flex-1 p-5 flex flex-col">{children}</div>
        <p className={`text-center text-[10px] pb-3 ${ready ? "text-emerald-200" : "text-stone-400"}`}>{t.brand}</p>
      </div>
    </div>
  );
}
