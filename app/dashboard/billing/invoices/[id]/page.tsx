import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { LocaleRoot } from "@/components/LocaleRoot";
import { PrintButton } from "@/components/PrintButton";
import { requireStaff } from "@/lib/auth";
import { getInvoice, isAdminEmail } from "@/lib/billing";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { staff, restaurant } = await requireStaff();
  // Owners see their own invoices; an admin can open any invoice.
  const inv = await getInvoice(id, isAdminEmail(staff.email) ? null : restaurant.id);
  if (!inv) notFound();
  const locale = await hostLocale();
  const t = dict(locale);
  return (
    <LocaleRoot locale={locale}>
      <main className="flex-1 max-w-3xl w-full mx-auto px-3 sm:px-6 py-6 space-y-4">
        <div className="no-print flex items-center justify-between gap-2">
          <Link href="/dashboard/billing" className="text-sm font-bold text-ember hover:underline">
            {t.invBack}
          </Link>
          <PrintButton label={t.invPrint} />
        </div>
        <InvoiceDocument inv={inv} />
      </main>
    </LocaleRoot>
  );
}
