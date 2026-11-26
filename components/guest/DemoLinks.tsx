import { ChefHat, LayoutGrid, Smartphone } from "lucide-react";
import type { Dict } from "@/lib/i18n";

/** "Try the demo" panel on the demo restaurant's page. Plain links; nothing secret beyond the demo itself. */
export function DemoLinks({ t, table }: { t: Dict; table: string | null }) {
  const link = "flex items-center gap-3 p-3 rounded-xl bg-white border border-line hover:border-ink text-start";
  return (
    <section className="mb-5 p-4 rounded-2xl bg-amber-50 border border-gold space-y-3" aria-label={t.demoTitle}>
      <div>
        <p className="font-extrabold">{t.demoTitle}</p>
        <p className="text-xs text-stone-600">{t.demoSub}</p>
      </div>
      <div className="grid gap-2">
        {table && (
          <a href={table} className={link}>
            <Smartphone className="w-5 h-5 text-ember shrink-0" aria-hidden />
            <span>
              <span className="block font-bold text-sm">{t.demoTable}</span>
              <span className="block text-xs text-stone-600">{t.demoTableSub}</span>
            </span>
          </a>
        )}
        <a href="/login?next=/dashboard/floor" className={link}>
          <LayoutGrid className="w-5 h-5 text-ember shrink-0" aria-hidden />
          <span>
            <span className="block font-bold text-sm">{t.demoFloor}</span>
            <span className="block text-xs text-stone-600">{t.demoFloorSub}</span>
          </span>
        </a>
        <a href="/login?next=/dashboard/kitchen" className={link}>
          <ChefHat className="w-5 h-5 text-ember shrink-0" aria-hidden />
          <span>
            <span className="block font-bold text-sm">{t.demoKitchen}</span>
            <span className="block text-xs text-stone-600">{t.demoKitchenSub}</span>
          </span>
        </a>
      </div>
      <p className="text-[11px] text-stone-600">{t.demoAskLogin}</p>
    </section>
  );
}
