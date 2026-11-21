"use client";

import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import { setLangCookie } from "@/lib/format";
import type { Locale } from "@/lib/types";

/** cookie = "tp_lang" for staff screens, "tp_glang" for guest screens. */
export function LangSwitch({ current, cookie, tone = "dark" }: { current: Locale; cookie: string; tone?: "dark" | "light" }) {
  const router = useRouter();
  const dark = tone === "dark";
  return (
    <div
      dir="ltr"
      role="group"
      aria-label="Language"
      className={`flex items-center p-0.5 rounded-lg border text-xs font-bold ${dark ? "bg-ink-2 border-stone-700" : "bg-white border-line"}`}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === current}
          onClick={() => {
            setLangCookie(cookie, l);
            router.refresh();
          }}
          className={`px-2.5 py-1 rounded-md transition-all ${
            l === current
              ? dark
                ? "bg-cream text-ink shadow-sm"
                : "bg-ink text-white"
              : dark
                ? "text-stone-400 hover:text-white"
                : "text-stone-500 hover:text-ink"
          }`}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
