import { AuthShell } from "@/components/AuthShell";
import { InviteAccept } from "@/components/InviteAccept";
import { fmt } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import { viewInvite } from "@/lib/staff";

export const dynamic = "force-dynamic";

/** Staff invite link: shows who invited them and for which role, then they set a password. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await hostLocale();
  const t = dict(locale);
  const inv = await viewInvite(token);
  const d = t as unknown as Record<string, string>;
  if (!inv) {
    return (
      <AuthShell t={t} locale={locale} title={t.invInvalidTitle} sub={t.invInvalidSub}>
        <p className="text-sm text-stone-600">{t.invInvalidHelp}</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell t={t} locale={locale} title={fmt(t.invTitle, { restaurant: inv.restaurant })} sub={fmt(t.invSub, { name: inv.name, role: d[`role_${inv.role}`] })}>
      <InviteAccept t={t} token={token} login={inv.contact} />
    </AuthShell>
  );
}
