import { HostTopBar } from "@/components/HostTopBar";
import { LocaleRoot } from "@/components/LocaleRoot";
import { BillingView } from "@/components/host/BillingView";
import { requireStaff } from "@/lib/auth";
import { accessOf, billingConfig, canPayOnline, latestSubscription, listInvoices, priceOf } from "@/lib/billing";
import { fmt } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import { FREE_LIMIT } from "@/lib/queue";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { staff, restaurant: r } = await requireStaff();
  const locale = await hostLocale();
  const t = dict(locale);
  const { checkout } = await searchParams;
  const [sub, invoices] = await Promise.all([latestSubscription(r.id), listInvoices(r.id)]);
  const cfg = billingConfig();
  const access = accessOf(r);

  return (
    <LocaleRoot locale={locale}>
      <HostTopBar t={t} locale={locale} restaurant={r} active="plans" />
      <BillingView
        t={t}
        locale={locale}
        access={access}
        trialEnded={access.kind === "free" && r.trialEndsAt !== null}
        sub={sub ? { status: sub.status, provider: sub.provider, cancelRequestedAt: sub.cancelRequestedAt, currentPeriodEnd: sub.currentPeriodEnd } : null}
        invoices={invoices.map((i) => ({ id: i.id, number: i.number, issuedAt: i.issuedAt, periodStart: i.periodStart, periodEnd: i.periodEnd, total: i.total, currency: i.currency }))}
        price={priceOf(r.country)}
        taxNote={cfg.taxRate ? fmt(t.billIncludesTax, { label: `${cfg.taxLabel} ${cfg.taxRate}%` }) : null}
        canPayOnline={canPayOnline(r.country)}
        isOwner={staff.role === "owner"}
        contact={cfg.salesContact}
        freeLimit={FREE_LIMIT}
        checkout={checkout === "return" || checkout === "cancelled" ? checkout : null}
      />
    </LocaleRoot>
  );
}
