import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { getStaff } from "@/lib/auth";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your restaurant",
  description: "Set up your restaurant on Table & Bell in minutes. Free plan, no card needed.",
  alternates: { canonical: "/signup" },
};


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
