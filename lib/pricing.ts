import type { Country } from "./types";

/**
 * Placeholder prices. Change them here; every page reads from this file.
 * Payment methods depend on which gateway you sign up with (see README).
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
    methods: ["mada", "Apple Pay", "Visa / Mastercard", "STC Pay"],
  },
  PK: {
    currency: "PKR",
    pro: 6000,
    bundles: [
      { credits: 500, price: 2500 },
      { credits: 1500, price: 6500 },
    ],
    methods: ["Raast", "JazzCash", "EasyPaisa", "Visa / Mastercard"],
  },
};

export function money(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
