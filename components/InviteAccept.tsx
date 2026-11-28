"use client";

import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/password";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/i18n";

const input = "w-full px-3.5 py-2.5 rounded-xl bg-white border border-line text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ember";

export function InviteAccept({ t, token, login }: { t: Dict; token: string; login: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = t as unknown as Record<string, string>;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    if (password !== String(f.get("confirm") ?? "")) return setError(t.invMismatch);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) }).catch(() => null);
    const out = res ? ((await res.json().catch(() => ({}))) as { error?: string; home?: string }) : {};
    if (res?.ok) {
      router.push(out.home ?? "/dashboard");
      router.refresh();
      return;
    }
    setBusy(false);
    setError((out.error && d[`invErr_${out.error}`]) || t.errorGeneric);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="p-3 rounded-xl bg-cream border border-line text-sm">
        <span className="text-stone-600">{t.invYourLogin}</span>{" "}
        <bdi dir="ltr" className="font-extrabold">
          {login}
        </bdi>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-bold">{t.password}</span>
        <input name="password" type="password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} autoComplete="new-password" className={input} />
        <span className="block text-xs text-stone-500">{t.passwordHelp}</span>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-bold">{t.invConfirm}</span>
        <input name="confirm" type="password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} autoComplete="new-password" className={input} />
      </label>
      {error && (
        <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-ember hover:bg-ember-dark text-white font-extrabold disabled:opacity-60">
        {t.invJoin}
      </button>
    </form>
  );
}
