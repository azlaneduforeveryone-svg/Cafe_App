"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import type { Country } from "@/lib/types";

const input =
  "w-full px-3.5 py-2.5 rounded-xl bg-white border border-line text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ember";

export function AuthForm({ mode, t, defaultCountry, demo }: { mode: "login" | "signup"; t: Dict; defaultCountry: Country; demo?: { email: string; password: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      const { error: code } = (await res.json().catch(() => ({}))) as { error?: string };
      setError(code === "invalid" ? t.errInvalid : code === "exists" ? t.errExists : code === "fields" ? t.errFields : t.errorGeneric);
    } catch {
      setError(t.errorGeneric);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
      <Field label={t.email}>
        <input name="email" type="email" required dir="ltr" autoComplete="email" defaultValue={demo?.email} className={input} />
      </Field>
      <Field label={t.password} help={mode === "signup" ? t.passwordHelp : undefined}>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : 1}
          dir="ltr"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          defaultValue={demo?.password}
          className={input}
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
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
