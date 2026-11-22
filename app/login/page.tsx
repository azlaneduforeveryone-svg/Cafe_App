import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { getStaff } from "@/lib/auth";
import { DEMO_EMAIL, DEMO_PASSWORD, showDemoLogin } from "@/lib/demo";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getStaff()) redirect("/dashboard");
  const { error } = await searchParams;
  const locale = await hostLocale();
  const t = dict(locale);
  return (
    <AuthShell t={t} locale={locale} title={t.loginTitle} sub={t.loginSub}>
      <AuthForm
        mode="login"
        t={t}
        defaultCountry="PK"
        initialError={error === "link" ? t.errLink : undefined}
        demo={showDemoLogin() ? { email: DEMO_EMAIL, password: DEMO_PASSWORD } : undefined}
      />
    </AuthShell>
  );
}
