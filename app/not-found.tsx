import Link from "next/link";
import { SearchX } from "lucide-react";
import { LocaleRoot } from "@/components/LocaleRoot";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";

export default async function NotFound() {
  const locale = await hostLocale();
  const t = dict(locale);
  return (
    <LocaleRoot locale={locale}>
      <main className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-8">
        <SearchX className="w-10 h-10 text-ember" aria-hidden />
        <h1 className="display text-2xl font-bold">{t.notFoundTitle}</h1>
        <p className="text-sm text-stone-600">{t.notFoundSiteBody}</p>
        <nav className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href="/" className="px-4 py-2.5 rounded-xl bg-ink text-white text-sm font-bold">
            {t.notFoundHome}
          </Link>
          <Link href="/pricing" className="px-4 py-2.5 rounded-xl bg-cream border border-line text-sm font-bold">
            {t.plans}
          </Link>
          <Link href="/login" className="px-4 py-2.5 rounded-xl bg-cream border border-line text-sm font-bold">
            {t.signIn}
          </Link>
        </nav>
        <p className="text-xs text-stone-500 mt-2">{t.notFoundBody}</p>
      </main>
    </LocaleRoot>
  );
}
