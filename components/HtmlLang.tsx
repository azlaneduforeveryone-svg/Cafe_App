"use client";

import { useEffect } from "react";
import type { Locale } from "@/lib/types";

/**
 * Puts the page's language and direction on <html> too, so screen readers and browsers
 * treat Arabic and Urdu pages as Arabic and Urdu (the inner wrapper already sets them).
 */
export function HtmlLang({ locale, dir }: { locale: Locale; dir: "ltr" | "rtl" }) {
  useEffect(() => {
    const el = document.documentElement;
    el.lang = locale;
    el.dir = dir;
  }, [locale, dir]);
  return null;
}
