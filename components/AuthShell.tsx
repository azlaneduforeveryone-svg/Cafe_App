import { Brand } from "./Brand";
import { LangSwitch } from "./LangSwitch";
import { LocaleRoot } from "./LocaleRoot";
import { HOST_COOKIE } from "@/lib/locale";
import type { Dict } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function AuthShell({ t, locale, title, sub, children }: { t: Dict; locale: Locale; title: string; sub: string; children: React.ReactNode }) {
  return (
    <LocaleRoot locale={locale}>
      <header className="bg-ink">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Brand name={t.brand} />
          <LangSwitch current={locale} cookie={HOST_COOKIE} />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white rounded-3xl border border-line shadow-xl p-6 sm:p-8">
          <h1 className="display text-2xl font-bold">{title}</h1>
          <p className="text-sm text-stone-500 mt-1 mb-6">{sub}</p>
          {children}
        </div>
      </main>
    </LocaleRoot>
  );
}
