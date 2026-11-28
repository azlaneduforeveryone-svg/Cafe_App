"use client";

import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/password";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/i18n";

const input =
  "w-full px-3.5 py-2.5 rounded-xl bg-white border border-line text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ember";
const button = "w-full py-3.5 rounded-2xl bg-ember hover:bg-ember-dark disabled:opacity-60 text-white font-extrabold text-sm shadow-lg shadow-ember/25";

function errorText(t: Dict, code?: string) {
  if (code === "rate_limited") return t.errRateLimit;
  if (code === "fields") return t.errFields;
  if (code === "weak_password") return t.errWeakPassword;
  if (code === "no_session") return t.resetNeedsLink;
  return t.errorGeneric;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const out = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : { error: "network" };
  return { ok: !!res?.ok, error: out.error };
}

export function ForgotForm({ t }: { t: Dict }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <div role="status" className="space-y-3 text-center">
        <p className="text-sm text-stone-600">{t.resetSent}</p>
        <Link href="/login" className="inline-block font-bold text-ember hover:underline text-sm">
          {t.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await post("/api/auth/forgot", { email: new FormData(e.currentTarget).get("email") });
        if (r.ok) setSent(true);
        else setError(errorText(t, r.error));
        setBusy(false);
      }}
    >
      <label className="block">
        <span className="block text-xs font-bold text-stone-700 mb-1">{t.email}</span>
        <input name="email" type="email" required dir="ltr" autoComplete="email" className={input} />
      </label>
      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className={button}>
        {t.sendResetLink}
      </button>
      <p className="text-center">
        <Link href="/login" className="text-sm font-bold text-ember hover:underline">
          {t.backToLogin}
        </Link>
      </p>
    </form>
  );
}

export function ResetForm({ t }: { t: Dict }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await post("/api/auth/reset", { password: new FormData(e.currentTarget).get("password") });
        if (r.ok) {
          router.push("/dashboard");
          router.refresh();
          return;
        }
        setError(errorText(t, r.error));
        setBusy(false);
      }}
    >
      <label className="block">
        <span className="block text-xs font-bold text-stone-700 mb-1">{t.newPassword}</span>
        <input name="password" type="password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} dir="ltr" autoComplete="new-password" className={input} />
        <span className="block text-[11px] text-stone-500 mt-1">{t.passwordHelp}</span>
      </label>
      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className={button}>
        {t.setPassword}
      </button>
    </form>
  );
}
