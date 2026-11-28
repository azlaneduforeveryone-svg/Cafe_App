import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { getStaff } from "@/lib/auth";
import { safeNext } from "@/lib/demo";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const dest = safeNext(next);
  if (await getStaff()) redirect(dest);
  const locale = await hostLocale();
  const t = dict(locale);
  return (
    <AuthShell t={t} locale={locale} title={t.loginTitle} sub={t.loginSub}>
      <AuthForm
        mode="login"
        t={t}
        defaultCountry="PK"
        initialError={
          error === "link"
            ? t.errLink
            : error === "invalid"
              ? t.errInvalid
              : error === "rate_limited"
                ? t.errRateLimit
                : error === "not_confirmed"
                  ? t.errNotConfirmed
                  : undefined
        }
        next={dest}
      />
    </AuthShell>
  );
}
