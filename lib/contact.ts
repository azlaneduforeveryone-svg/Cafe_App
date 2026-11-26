import "server-only";

/** Company addresses (Zoho mailboxes and aliases on tableandbell.com). Public by design. */
export const COMPANY_EMAILS = {
  hello: "hello@tableandbell.com",
  sales: "sales@tableandbell.com",
  support: "support@tableandbell.com",
  billing: "billing@tableandbell.com",
} as const;

export type CompanyEmailKind = keyof typeof COMPANY_EMAILS;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sales contact shown on the landing page ("Book a demo" and footer).
 *   CONTACT_WHATSAPP  international number, digits only, e.g. 9665XXXXXXXX
 *   CONTACT_EMAIL     optional override for the general address (default hello@tableandbell.com)
 */
export function salesContact() {
  const wa = (process.env.CONTACT_WHATSAPP ?? "").replace(/\D/g, "");
  const email = (process.env.CONTACT_EMAIL ?? "").trim();
  return {
    whatsapp: wa.length >= 9 && wa.length <= 15 ? wa : null,
    email: EMAIL.test(email) ? email : COMPANY_EMAILS.hello,
  };
}
