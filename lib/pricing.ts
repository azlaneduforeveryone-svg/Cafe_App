import type { Country } from "./types";

/**
 * Placeholder prices. Change them here; every page reads from this file.
 * methods: only the ways a restaurant can really pay for Pro today (shown on /pricing).
 */
export const PRICING: Record<
  Country,
  { currency: string; pro: number; bundles: { credits: number; price: number }[]; methods: string[] }
> = {
  SA: {
    currency: "SAR",
    pro: 79,
    bundles: [
      { credits: 500, price: 49 },
      { credits: 1500, price: 129 },
    ],
    // No online gateway in Saudi Arabia yet: Pro is invoiced and paid by bank transfer.
    methods: [],
  },
  PK: {
    currency: "PKR",
    pro: 6000,
    bundles: [
      { credits: 500, price: 2500 },
      { credits: 1500, price: 6500 },
    ],
    // Only what checkout really offers today (Safepay card). Add wallets here when they go live.
    methods: ["Visa / Mastercard"],
  },
};

export function money(amount: number, currency: string) {
  // Whole amounts stay short (SAR 68); fractions always show two places (SAR 74.80, not 74.8).
  const frac = Math.round(amount * 100) % 100 !== 0;
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 })}`;
}
