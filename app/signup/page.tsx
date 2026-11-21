import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { getStaff } from "@/lib/auth";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";

export default async function SignupPage() {
  if (await getStaff()) redirect("/dashboard");
  const locale = await hostLocale();
  const t = dict(locale);
  return (
    <AuthShell t={t} locale={locale} title={t.signupTitle} sub={t.signupSub}>
      <AuthForm mode="signup" t={t} defaultCountry={locale === "ar" ? "SA" : "PK"} />
    </AuthShell>
  );
}
