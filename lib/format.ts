import type { Locale, PublicRestaurant, Section } from "./types";

export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

export function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function restaurantName(r: Pick<PublicRestaurant, "name" | "nameAr" | "nameUr">, locale: Locale) {
  if (locale === "ar" && r.nameAr) return r.nameAr;
  if (locale === "ur" && r.nameUr) return r.nameUr;
  return r.name;
}

export function sectionName(sections: Section[], id: string, locale: Locale) {
  const s = sections.find((x) => x.id === id);
  return s ? s[locale] || s.en : "";
}

export const dirOf = (l: Locale) => (l === "en" ? "ltr" : "rtl");

export function setLangCookie(name: string, lang: Locale) {
  document.cookie = `${name}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
