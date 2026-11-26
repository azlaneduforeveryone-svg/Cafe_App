import { Mail } from "lucide-react";
import type { CompanyEmailKind } from "@/lib/contact";
import { COMPANY_EMAILS } from "@/lib/contact";
import type { Dict } from "@/lib/i18n";

const LABEL: Record<CompanyEmailKind, [keyof Dict, keyof Dict]> = {
  hello: ["contactGeneral", "contactGeneralNote"],
  sales: ["contactSales", "contactSalesNote"],
  support: ["contactSupport", "contactSupportNote"],
  billing: ["contactBilling", "contactBillingNote"],
};

/** A small list of company email addresses with what each one is for. */
export function ContactEmails({ t, kinds, className = "" }: { t: Dict; kinds: CompanyEmailKind[]; className?: string }) {
  return (
    <ul className={`grid gap-3 ${kinds.length === 3 ? "sm:grid-cols-3" : kinds.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2"} ${className}`}>
      {kinds.map((k) => {
        const [label, note] = LABEL[k];
        return (
          <li key={k} className="p-3.5 rounded-2xl bg-white border border-line text-start">
            <p className="text-xs font-extrabold text-ink">{t[label] as string}</p>
            <p className="text-[11px] text-stone-500 mb-1.5">{t[note] as string}</p>
            <a href={`mailto:${COMPANY_EMAILS[k]}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-ember hover:underline break-all">
              <Mail className="w-4 h-4 shrink-0" aria-hidden />
              <bdi dir="ltr">{COMPANY_EMAILS[k]}</bdi>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
