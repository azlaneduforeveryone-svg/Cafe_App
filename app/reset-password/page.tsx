import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { ResetForm } from "@/components/PasswordForms";
import { createClient } from "@/lib/supabase/server";
import { dict } from "@/lib/i18n";
import { hostLocale } from "@/lib/locale";

/** Reached from the reset email link, which logs the user in first (see /auth/confirm). */
export default async function ResetPasswordPage() {
  const locale = await hostLocale();
  const t = dict(locale);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AuthShell t={t} locale={locale} title={t.resetTitle} sub={user?.email ?? ""}>
      {user ? (
        <ResetForm t={t} />
      ) : (
        <div className="space-y-3 text-center">
          <p className="text-sm text-stone-600">{t.resetNeedsLink}</p>
          <Link href="/forgot-password" className="inline-block font-bold text-ember hover:underline text-sm">
            {t.sendResetLink}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
