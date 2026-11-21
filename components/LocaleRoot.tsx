import { dirOf } from "@/lib/format";
import type { Locale } from "@/lib/types";

/** Sets language, direction and font for everything inside it. */
export function LocaleRoot({ locale, className = "", children }: { locale: Locale; className?: string; children: React.ReactNode }) {
  return (
    <div lang={locale} dir={dirOf(locale)} className={`loc-${locale} min-h-screen flex flex-col ${className}`}>
      {children}
    </div>
  );
}
