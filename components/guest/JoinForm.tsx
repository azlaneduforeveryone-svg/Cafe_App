"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Ticket } from "lucide-react";
import { unlockAudio } from "@/lib/chime";
import { fmt } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { Locale, PublicRestaurant } from "@/lib/types";

const SIZES = [1, 2, 3, 4, 5, 6, 7, 8];
export const ticketKey = (slug: string) => `tp_ticket_${slug}`;

export function JoinForm({ t, locale, restaurant, eta, waiting }: { t: Dict; locale: Locale; restaurant: PublicRestaurant; eta: number; waiting: number }) {
  const router = useRouter();
  const [partySize, setPartySize] = useState(2);
  const [sectionId, setSectionId] = useState(restaurant.sections[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);

  // Offer "Open my ticket" only if the saved ticket still exists and is still in line.
  // Old or closed tickets (e.g. from before an update) are forgotten instead.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(ticketKey(restaurant.slug));
    } catch {}
    if (!saved) return;
    let cancelled = false;
    fetch(`/api/ticket/${encodeURIComponent(saved)}`, { cache: "no-store" })
      .then(async (res) => {
        const snap = res.ok ? ((await res.json()) as { entry?: { status?: string } }) : null;
        const active = snap?.entry?.status === "waiting" || snap?.entry?.status === "notified";
        if (cancelled) return;
        if (active) setExisting(saved);
        else if (res.status === 404 || snap) {
          try {
            localStorage.removeItem(ticketKey(restaurant.slug));
          } catch {}
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [restaurant.slug]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    unlockAudio(); // this tap lets the ticket page play the chime later
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/r/${restaurant.slug}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), phone: form.get("phone"), partySize, sectionId, lang: locale }),
    }).catch(() => null);
    const out = res ? ((await res.json().catch(() => ({}))) as { token?: string; error?: string }) : {};
    // 409: this phone already has a ticket here, so open that one instead.
    if ((res?.ok || res?.status === 409) && out.token) {
      try {
        localStorage.setItem(ticketKey(restaurant.slug), out.token);
      } catch {}
      router.push(`/r/${restaurant.slug}/t/${out.token}`);
    } else {
      setError(res?.status === 429 ? t.errRateLimit : t.errorGeneric);
      setBusy(false);
    }
  }

  if (existing) {
    return (
      <div className="p-4 rounded-2xl bg-amber-50 border border-gold/50 text-sm font-semibold space-y-3 text-center">
        <p>{t.existingTicket}</p>
        <Link href={`/r/${restaurant.slug}/t/${existing}`} className="inline-flex px-4 py-2.5 rounded-xl bg-ink text-white font-bold items-center gap-1.5">
          <Ticket className="w-4 h-4" aria-hidden />
          {t.openTicket}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">

      <div className="bg-white rounded-2xl p-3.5 border border-line shadow-sm flex items-center justify-between gap-3">
        <div>
          <h1 className="font-extrabold text-base">{t.joinTitle}</h1>
          <p className="text-xs text-stone-500 mt-0.5">{t.joinSub}</p>
        </div>
        <div className="shrink-0 bg-cream border border-gold/50 rounded-xl px-3 py-2 text-center">
          <span className="block text-[10px] font-bold uppercase text-stone-500">{t.estWait}</span>
          <span className="text-base font-extrabold text-ember">
            {waiting === 0 ? t.noWait : `~${eta} ${t.min}`}
          </span>
          <span className="block text-[10px] text-stone-500">{fmt(t.partiesWaiting, { n: waiting })}</span>
        </div>
      </div>

      <label className="block">
        <span className="block text-xs font-bold text-stone-700 mb-1">{t.yourName}</span>
        <input
          name="name"
          required
          maxLength={60}
          autoComplete="given-name"
          placeholder={t.namePh}
          className="w-full px-3.5 py-3 rounded-xl bg-white border border-line text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ember"
        />
      </label>

      <fieldset>
        <legend className="block text-xs font-bold text-stone-700 mb-1.5">{t.partySize}</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {SIZES.map((n) => (
            <button
              type="button"
              key={n}
              aria-pressed={partySize === n}
              onClick={() => setPartySize(n)}
              className={`py-2.5 rounded-xl text-sm font-extrabold border transition-all ${
                partySize === n ? "bg-ink text-white border-ink shadow-sm" : "bg-white text-stone-700 border-line hover:border-stone-400"
              }`}
            >
              <span className="ltr">{n === 8 ? "8+" : n}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {restaurant.sections.length > 1 && (
        <fieldset>
          <legend className="block text-xs font-bold text-stone-700 mb-1.5">{t.section}</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {restaurant.sections.map((s) => (
              <button
                type="button"
                key={s.id}
                aria-pressed={sectionId === s.id}
                onClick={() => setSectionId(s.id)}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                  sectionId === s.id ? "bg-ember/10 text-ember border-ember" : "bg-white text-stone-600 border-line"
                }`}
              >
                {s[locale] || s.en}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="block">
        <span className="block text-xs font-bold text-stone-700 mb-1">{t.phoneLabel}</span>
        <input
          name="phone"
          type="tel"
          dir="ltr"
          maxLength={20}
          autoComplete="tel"
          placeholder={restaurant.country === "SA" ? "+966 5X XXX XXXX" : "+92 3XX XXXXXXX"}
          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-line text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ember"
        />
        <span className="block text-[11px] text-stone-500 mt-1">
          {t.phoneHelp}{" "}
          <Link href="/privacy" target="_blank" className="underline font-semibold text-stone-600">
            {t.privacyLink}
          </Link>
        </span>
      </label>

      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full py-4 rounded-2xl bg-ember hover:bg-ember-dark active:scale-[0.98] disabled:opacity-60 text-white font-extrabold text-sm shadow-lg shadow-ember/25 transition-all flex items-center justify-center gap-2"
      >
        <Bell className="w-4 h-4" aria-hidden />
        {t.joinBtn}
      </button>
    </form>
  );
}
