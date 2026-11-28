import Link from "next/link";
import type { Dict } from "@/lib/i18n";

/** Privacy Policy and Terms links, used in footers across the site and guest pages. */
export function LegalLinks({ t, className = "" }: { t: Dict; className?: string }) {
  return (
    <nav aria-label={`${t.privacyLink}, ${t.termsLink}`} className={`flex items-center justify-center gap-3 ${className}`}>
      <Link href="/privacy" className="hover:underline">
        {t.privacyLink}
      </Link>
      <span aria-hidden>·</span>
      <Link href="/terms" className="hover:underline">
        {t.termsLink}
      </Link>
    </nav>
  );
}
