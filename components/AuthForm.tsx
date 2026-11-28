"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import type { Country } from "@/lib/types";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/password";

const noop = () => () => {};

const input =
  "w-full px-3.5 py-2.5 rounded-xl bg-white border border-line text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ember";

export function AuthForm({
  mode,
  t,
  defaultCountry,
  demo,
  initialError,
  next = "/dashboard",
}: {
  mode: "login" | "signup";
  t: Dict;
  defaultCountry: Country;
  demo?: { email: string; password: string };
  initialError?: string;
  /** Already checked on the server (dashboard pages only). */
  next?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  // Until the page's JavaScript runs, the button stays off so nothing is sent the slow way.
  const ready = useSyncExternalStore(noop, () => true, () => false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = Object.fromEntries(new FormData(e.currentTarget));
    if (mode === "signup") body.acceptTerms = body.acceptTerms === "on";
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: string; needsConfirm?: boolean };
      if (res.ok && out.needsConfirm) {
        setConfirmEmail(String(body.email ?? ""));
        setBusy(false);
        return;
      }
      if (res.ok) {
        router.push(next);
        router.refresh();
        return;
      }
      const code = out.error;
      setError(
        code === "invalid"
          ? t.errInvalid
          : code === "exists"
            ? t.errExists
            : code === "fields"
              ? t.errFields
              : code === "not_confirmed"
                ? t.errNotConfirmed
                : code === "rate_limited"
                  ? t.errRateLimit
                  : code === "weak_password"
                    ? t.errWeakPassword
                    : code === "terms"
                      ? t.errTerms
                      : t.errorGeneric,
      );
    } catch {
      setError(t.errorGeneric);
    }
    setBusy(false);
  }

  if (confirmEmail) {
    return (
      <div role="status" className="space-y-3 text-center">
        <h2 className="font-extrabold text-lg">{t.checkEmailTitle}</h2>
        <p className="text-sm text-stone-600">{t.checkEmailBody.replace("{email}", confirmEmail)}</p>
        <Link href="/login" className="inline-block mt-2 font-bold text-ember hover:underline text-sm">
          {t.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form method="post" action={`/api/auth/${mode}`} onSubmit={onSubmit} className="space-y-4">
      {mode === "signup" && (
        <>
          <Field label={t.yourName}>
            <input name="name" required maxLength={60} autoComplete="name" className={input} />
          </Field>
          <Field label={t.restaurantName}>
            <input name="restaurantName" required maxLength={80} className={input} />
          </Field>
          <Field label={t.country}>
            <select name="country" defaultValue={defaultCountry} className={`${input} font-bold`}>
              <option value="SA">{t.countrySA}</option>
              <option value="PK">{t.countryPK}</option>
            </select>
          </Field>
        </>
      )}
      <Field label={mode === "login" ? t.emailOrMobile : t.email}>
        <input
          name="email"
          type={mode === "login" ? "text" : "email"}
          inputMode={mode === "login" ? "email" : undefined}
          required
          dir="ltr"
          autoComplete={mode === "login" ? "username" : "email"}
          defaultValue={demo?.email}
          className={input}
        />
      </Field>
      <Field label={t.password} help={mode === "signup" ? t.passwordHelp : undefined}>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? PASSWORD_MIN : 1}
          maxLength={PASSWORD_MAX}
          dir="ltr"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          defaultValue={demo?.password}
          className={input}
        />
      </Field>

      {mode === "login" && (
        <p className="text-end -mt-2">
          <Link href="/forgot-password" className="text-xs font-bold text-ember hover:underline">
            {t.forgotPassword}
          </Link>
        </p>
      )}

      {mode === "signup" && (
        <label className="flex items-start gap-2 text-xs text-stone-600">
          <input type="checkbox" name="acceptTerms" required className="mt-0.5 w-4 h-4 accent-ember shrink-0" />
          <span>
            {t.acceptTerms.split(/(\{terms\}|\{privacy\})/).map((part, i) =>
              part === "{terms}" ? (
                <Link key={i} href="/terms" target="_blank" className="font-bold text-ember hover:underline">
                  {t.termsLink}
                </Link>
              ) : part === "{privacy}" ? (
                <Link key={i} href="/privacy" target="_blank" className="font-bold text-ember hover:underline">
                  {t.privacyLink}
                </Link>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !ready}
        className="w-full py-3.5 rounded-2xl bg-ember hover:bg-ember-dark disabled:opacity-60 text-white font-extrabold text-sm shadow-lg shadow-ember/25"
      >
        {busy ? "..." : mode === "signup" ? t.createAccount : t.signIn}
      </button>

      <p className="text-center text-sm text-stone-600">
        {mode === "signup" ? t.haveAccount : t.noAccount}{" "}
        <Link href={mode === "signup" ? "/login" : "/signup"} className="font-bold text-ember hover:underline">
          {mode === "signup" ? t.signIn : t.signup}
        </Link>
      </p>
    </form>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-stone-700 mb-1">{label}</span>
      {children}
      {help && <span className="block text-[11px] text-stone-500 mt-1">{help}</span>}
    </label>
  );
}
