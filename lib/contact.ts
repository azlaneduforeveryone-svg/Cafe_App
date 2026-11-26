import "server-only";

/**
 * Sales contact shown on the landing page ("Book a demo" and footer).
 *   CONTACT_WHATSAPP  international number, digits only, e.g. 9665XXXXXXXX
 *   CONTACT_EMAIL     e.g. hello@tableandbell.com
 * Both optional; anything missing is simply not shown.
 */
export function salesContact() {
  const wa = (process.env.CONTACT_WHATSAPP ?? "").replace(/\D/g, "");
  const email = (process.env.CONTACT_EMAIL ?? "").trim();
  return {
    whatsapp: wa.length >= 9 && wa.length <= 15 ? wa : null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
  };
}
