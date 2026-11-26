import localFont from "next/font/local";

/*
 * Fonts are bundled with the app (OFL-1.1, see app/fonts/LICENSE.md) and served from our own
 * domain: guests' phones never contact Google or any other font service, and the build needs no
 * network.
 *
 *   English  UI: Plus Jakarta Sans            headings: Playfair Display
 *   Arabic   UI: IBM Plex Sans Arabic         headings: Amiri
 *   Urdu     UI: Gulzar (compact Nastaliq)    headings: Noto Nastaliq Urdu
 * The Arabic and Urdu files hold Arabic script only; Latin letters and digits inside them (prices,
 * ticket numbers) use Plus Jakarta Sans so they stay crisp.
 *
 * Only Plus Jakarta Sans is preloaded. The rest (about 1 MB) download only when a page actually
 * shows Arabic, Urdu or a Playfair heading, so English visitors never fetch the Nastaliq files.
 */
export const jakarta = localFont({
  src: [
    { path: "./fonts/plus-jakarta-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  variable: "--ff-jakarta",
  display: "swap",
});
export const playfair = localFont({
  src: [
    { path: "./fonts/playfair-display-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/playfair-display-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--ff-playfair",
  display: "swap",
  preload: false,
});
export const plexArabic = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--ff-plex-ar",
  display: "swap",
  preload: false,
});
export const amiri = localFont({
  src: [
    { path: "./fonts/amiri-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/amiri-arabic-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--ff-amiri",
  display: "swap",
  preload: false,
});
export const gulzar = localFont({
  src: [{ path: "./fonts/gulzar-arabic-400-normal.woff2", weight: "400", style: "normal" }],
  variable: "--ff-gulzar",
  display: "swap",
  preload: false,
});
export const nastaliq = localFont({
  src: [
    { path: "./fonts/noto-nastaliq-urdu-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/noto-nastaliq-urdu-arabic-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--ff-nastaliq",
  display: "swap",
  preload: false,
});

export const fontVariables = [jakarta, playfair, plexArabic, amiri, gulzar, nastaliq].map((f) => f.variable).join(" ");
