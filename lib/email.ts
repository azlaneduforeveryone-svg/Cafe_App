import "server-only";

/**
 * Sends an email through Resend's API (the same Resend account that sends login emails).
 * Needs RESEND_API_KEY in Vercel (Production). Without it, nothing is sent and the
 * caller is told so: no email ever leaves from a preview or local copy by accident.
 */
const FROM = "Table & Bell <no-reply@tableandbell.com>";
const REPLY_TO = "billing@tableandbell.com";

export type EmailResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [input.to], reply_to: REPLY_TO, subject: input.subject, html: input.html, text: input.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[tablepulse] email failed: HTTP ${res.status} ${body.slice(0, 200)}`);
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[tablepulse] email failed", err);
    return { ok: false, error: "network" };
  }
}

/** Escapes text for use inside the HTML email. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
