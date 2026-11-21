import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { getStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/seed";

export default async function LoginPage() {
  if (await getStaff()) redirect("/dashboard");
  const locale = await hostLocale();
  const t = dict(locale);
  const demoExists = db().staff.some((s) => s.email === DEMO_EMAIL);
  return (
    <AuthShell t={t} locale={locale} title={t.loginTitle} sub={t.loginSub}>
      <AuthForm
        mode="login"
        t={t}
        defaultCountry="PK"
        demo={demoExists && process.env.NODE_ENV !== "production" ? { email: DEMO_EMAIL, password: DEMO_PASSWORD } : undefined}
      />
    </AuthShell>
  );
}
