import { AuthShell } from "@/components/AuthShell";
import { ForgotForm } from "@/components/PasswordForms";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";

export default async function ForgotPasswordPage() {
  const locale = await hostLocale();
  const t = dict(locale);
  return (
    <AuthShell t={t} locale={locale} title={t.forgotTitle} sub={t.forgotSub}>
      <ForgotForm t={t} />
    </AuthShell>
  );
}
