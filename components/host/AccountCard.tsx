"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/password";

const input = "w-full px-3.5 py-2.5 rounded-xl bg-white border border-line text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ember";

/** Change your own password, or sign out of every device. */
export function AccountCard({ t, demo }: { t: Dict; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  async function change(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: f.get("current"), password: f.get("password") }),
    }).catch(() => null);
    const out = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
    setBusy(false);
    if (res?.ok) {
      form.reset();
      return setMsg({ ok: true, text: t.acctSaved });
    }
    const text =
      out.error === "wrong_password"
        ? t.acctWrong
        : out.error === "weak_password"
          ? t.errWeakPassword
          : out.error === "rate_limited"
            ? t.errRateLimit
            : out.error === "demo_locked"
              ? t.acctDemo
              : t.errorGeneric;
    setMsg({ ok: false, text });
  }

  async function signOutAll() {
    setBusy(true);
    const res = await fetch("/api/auth/logout-all", { method: "POST" }).catch(() => null);
    if (res?.ok) {
      router.push("/login");
      router.refresh();
      return;
    }
    setBusy(false);
    setConfirmAll(false);
    setMsg({ ok: false, text: res?.status === 403 ? t.acctDemo : t.errorGeneric });
  }

  return (
    <section className="bg-white rounded-3xl border border-line p-5 space-y-4">
      <div>
        <h2 className="font-extrabold flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-ember" aria-hidden />
          {t.acctTitle}
        </h2>
        <p className="text-sm text-stone-500 mt-0.5">{demo ? t.acctDemo : t.acctSub}</p>
      </div>

      <form onSubmit={change} className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-bold text-stone-700 mb-1">{t.acctCurrent}</span>
          <input name="current" type="password" required autoComplete="current-password" dir="ltr" disabled={demo} className={input} />
        </label>
        <label className="block">
          <span className="block text-xs font-bold text-stone-700 mb-1">{t.acctNew}</span>
          <input name="password" type="password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} autoComplete="new-password" dir="ltr" disabled={demo} className={input} />
          <span className="block text-[11px] text-stone-500 mt-1">{t.passwordHelp}</span>
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy || demo} className="px-4 py-2.5 rounded-xl bg-ink text-white text-xs font-bold disabled:opacity-50">
            {t.acctSave}
          </button>
        </div>
      </form>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>
          {msg.text}
        </p>
      )}

      <div className="border-t border-line pt-4">
        {confirmAll ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{t.acctSignOutConfirm}</span>
            <button type="button" onClick={() => setConfirmAll(false)} className="px-3 py-1.5 rounded-lg font-bold text-stone-600 hover:bg-cream">
              {t.acctCancel}
            </button>
            <button type="button" disabled={busy} onClick={signOutAll} className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold disabled:opacity-60">
              {t.acctConfirmYes}
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={demo}
              onClick={() => setConfirmAll(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50 disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden />
              {t.acctSignOutAll}
            </button>
            <p className="text-[11px] text-stone-500 mt-1.5">{t.acctSignOutAllHelp}</p>
          </>
        )}
      </div>
    </section>
  );
}
