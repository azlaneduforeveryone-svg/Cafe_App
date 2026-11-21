import "server-only";
import { cookies, headers } from "next/headers";
import { isLocale } from "./i18n";
import type { Country, Locale } from "./types";

export const HOST_COOKIE = "tp_lang";
export const GUEST_COOKIE = "tp_glang";

/** Staff screens: the host's own choice, English by default. */
export async function hostLocale(): Promise<Locale> {
  const v = (await cookies()).get(HOST_COOKIE)?.value;
  return isLocale(v) ? v : "en";
}

/** Guest screens: the guest's choice, then their phone language, then the restaurant's country. */
export async function guestLocale(country: Country): Promise<Locale> {
  const v = (await cookies()).get(GUEST_COOKIE)?.value;
  if (isLocale(v)) return v;
  const accept = ((await headers()).get("accept-language") ?? "").toLowerCase();
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2);
    if (code === "ar" || code === "ur" || code === "en") return code;
  }
  return country === "SA" ? "ar" : "en";
}

export async function siteOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
