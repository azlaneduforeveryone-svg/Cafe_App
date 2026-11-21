"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, Crown, Footprints, MessageSquare, Phone, Plus, QrCode, Users } from "lucide-react";
import { Modal } from "@/components/Modal";
import { useLive, useNow } from "@/components/useLive";
import { playChime, unlockAudio } from "@/lib/chime";
import { fmt, mmss, sectionName } from "@/lib/format";
import { LOCALES, LOCALE_LABELS, type Dict } from "@/lib/i18n";
import type { HostAction, HostEntry, HostSnapshot, Locale } from "@/lib/types";

const input = "w-full px-3 py-2.5 rounded-xl border border-line text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ember";

export function HostDashboard({ t, locale, initial }: { t: Dict; locale: Locale; initial: HostSnapshot }) {
  const { data, connected, clockOffset } = useLive("/api/host/stream", initial);
  const now = useNow(clockOffset);
  const { restaurant: r, entries, stats } = data;

  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3500);
  }, []);

  async function act(e: HostEntry, action: HostAction) {
    unlockAudio();
    setPending(e.id);
    try {
      const res = await fetch(`/api/host/entries/${e.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.status === 402) {
        setLimitOpen(true);
      } else if (!res.ok) {
        showToast(t.errorGeneric);
      } else {
        if (action === "notify") playChime();
        showToast(fmt(action === "notify" ? t.toastBuzzed : action === "seat" ? t.toastSeated : t.toastNoShow, { n: e.ticketNumber }));
      }
    } catch {
      showToast(t.errorGeneric);
    }
    setPending(null);
  }

  const totalGuests = entries.reduce((s, e) => s + e.partySize, 0);
  const atLimit = r.plan === "free" && r.alertsUsed >= r.freeLimit;
  const graceSec = r.gracePeriodMin * 60;

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6">
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Queue */}
        <section className="lg:col-span-8 space-y-4" aria-label={t.liveQueue}>
          <div className="bg-white rounded-3xl border border-line shadow-xl overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-cream border-b border-line">
              <Kpi label={t.waitingParties} value={entries.length} />
              <Kpi label={t.totalGuests} value={totalGuests} accent />
              <Kpi label={t.avgWait} value={stats.avgWaitToday ?? "–"} unit={stats.avgWaitToday !== null ? t.min : undefined} />
              <Link href="/pricing" className="bg-white p-3 rounded-2xl border border-gold/60 hover:bg-amber-50/50 text-start transition-colors">
                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                  {r.plan === "pro" ? <Crown className="w-3 h-3" aria-hidden /> : <MessageSquare className="w-3 h-3" aria-hidden />}
                  {r.plan === "pro" ? t.proName : t.alertsUsed}
                </span>
                <span className="text-2xl font-extrabold text-ink">
                  {r.plan === "pro" ? "∞" : <span className="ltr">{`${r.alertsUsed}/${r.freeLimit}`}</span>}
                </span>
              </Link>
            </div>

            {r.plan === "free" && (
              <div className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs ${atLimit ? "bg-red-50 border-red-200" : "bg-amber-50/80 border-gold/30"}`}>
                <div className="flex items-center gap-2 flex-1 min-w-48">
                  <AlertTriangle className={`w-4 h-4 shrink-0 ${atLimit ? "text-red-600" : "text-ember"}`} aria-hidden />
                  <span className="font-bold text-ink">{atLimit ? t.limitTitle : t.alertsUsed}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-stone-200 overflow-hidden max-w-40" aria-hidden>
                    <div className={`h-full ${atLimit ? "bg-red-500" : "bg-ember"}`} style={{ width: `${Math.min(100, (r.alertsUsed / r.freeLimit) * 100)}%` }} />
                  </div>
                </div>
                <Link href="/pricing" className="font-extrabold text-ember hover:underline">
                  {t.upgrade}
                </Link>
              </div>
            )}

            <div className="p-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h1 className="font-extrabold text-sm text-ink flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-ping" : "bg-amber-500"}`} aria-hidden />
                  {t.liveQueue}
                  <span className={`text-[11px] font-semibold ${connected ? "text-emerald-700" : "text-amber-700"}`}>{connected ? t.live : t.reconnecting}</span>
                </h1>
                <button
                  type="button"
                  onClick={() => setWalkIn(true)}
                  className="px-3.5 py-2 rounded-xl bg-ember hover:bg-ember-dark text-white text-xs font-extrabold shadow-sm flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" aria-hidden />
                  {t.addWalkIn}
                </button>
              </div>

              {entries.length === 0 ? (
                <p className="py-14 text-center text-stone-500 text-sm">{t.emptyQueue}</p>
              ) : (
                <ul className="space-y-2.5">
                  {entries.map((e) => {
                    const notified = e.status === "notified";
                    const left = notified && e.notifiedAt ? graceSec - (now - e.notifiedAt) / 1000 : graceSec;
                    const overdue = notified && left <= 0;
                    return (
                      <li
                        key={e.id}
                        className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          overdue ? "bg-red-50/70 border-red-300" : notified ? "bg-emerald-50/80 border-emerald-400 shadow-sm" : "bg-white border-line"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-12 h-12 rounded-xl font-mono font-extrabold text-sm flex items-center justify-center shrink-0 ${
                              notified ? "bg-go text-white" : "bg-ink text-gold"
                            }`}
                          >
                            <span className="ltr">#{e.ticketNumber}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-extrabold text-sm text-ink truncate">{e.name}</span>
                              <Badge>{LOCALE_LABELS[e.lang]}</Badge>
                              <Badge>{e.source === "walkin" ? t.walkIn : t.viaQr}</Badge>
                              {e.onTheWay && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white inline-flex items-center gap-1">
                                  <Footprints className="w-3 h-3" aria-hidden />
                                  {t.onTheWay}
                                </span>
                              )}
                              {overdue && <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-600 text-white">{t.overdue}</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-stone-500">
                              <span className="inline-flex items-center gap-1 font-semibold text-stone-700">
                                <Users className="w-3.5 h-3.5 text-ember" aria-hidden />
                                {e.partySize}
                              </span>
                              <span aria-hidden>•</span>
                              <span>{sectionName(r.sections, e.sectionId, locale)}</span>
                              <span aria-hidden>•</span>
                              <span>
                                {t.waited} <span className="font-mono font-bold text-stone-700 ltr">{mmss((now - e.joinedAt) / 1000)}</span>
                              </span>
                              {notified && (
                                <>
                                  <span aria-hidden>•</span>
                                  <span className={overdue ? "text-red-700 font-bold" : "text-emerald-700 font-bold"}>
                                    {t.graceLeft} <span className="font-mono ltr">{mmss(left)}</span>
                                  </span>
                                </>
                              )}
                              {e.phone && (
                                <a href={`tel:${e.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline">
                                  <Phone className="w-3 h-3" aria-hidden />
                                  <span className="ltr">{e.phone}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            disabled={pending === e.id}
                            onClick={() => act(e, "notify")}
                            className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1 shadow-sm text-white disabled:opacity-60 ${
                              notified ? "bg-emerald-600 hover:bg-emerald-700" : "bg-ember hover:bg-ember-dark"
                            }`}
                          >
                            <Bell className="w-3.5 h-3.5" aria-hidden />
                            {notified ? t.buzzAgain : t.notify}
                          </button>
                          <button
                            type="button"
                            disabled={pending === e.id}
                            onClick={() => act(e, "seat")}
                            className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold disabled:opacity-60"
                          >
                            {t.seat}
                          </button>
                          <button
                            type="button"
                            disabled={pending === e.id}
                            onClick={() => act(e, "no_show")}
                            className="px-2.5 py-2 rounded-xl bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-700 text-xs font-bold disabled:opacity-60"
                          >
                            {t.noShow}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Side panel */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="bg-ink text-cream rounded-3xl p-5 shadow-xl">
            <span className="text-[11px] uppercase tracking-wider font-bold text-gold">{t.nowServing}</span>
            <div className="display text-5xl font-extrabold mt-1">
              <span className="ltr">#{r.nowServing || "–"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="bg-ink-2 rounded-2xl p-3 border border-stone-700">
                <span className="text-[11px] text-stone-400 block">{t.seatedToday}</span>
                <span className="text-xl font-extrabold">{stats.seatedToday}</span>
              </div>
              <div className="bg-ink-2 rounded-2xl p-3 border border-stone-700">
                <span className="text-[11px] text-stone-400 block">{t.noShowsToday}</span>
                <span className="text-xl font-extrabold">{stats.noShowToday}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-line p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-ember" aria-hidden />
              <h2 className="font-extrabold text-sm">{t.qrTitle}</h2>
            </div>
            <p className="text-xs text-stone-500">{t.qrBody}</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/settings" className="px-3 py-2 rounded-xl bg-ink hover:bg-stone-800 text-white text-xs font-bold">
                {t.manageQr}
              </Link>
              <a
                href={`/r/${r.slug}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl bg-cream border border-line hover:border-stone-400 text-ink text-xs font-bold"
              >
                {t.openGuestPage}
              </a>
            </div>
          </div>
        </aside>
      </div>

      {walkIn && (
        <WalkInModal
          t={t}
          locale={locale}
          sections={r.sections}
          onClose={() => setWalkIn(false)}
          onAdded={(n, name) => {
            setWalkIn(false);
            showToast(fmt(t.toastAdded, { n, name }));
          }}
        />
      )}

      {limitOpen && (
        <Modal title={t.limitTitle} onClose={() => setLimitOpen(false)} closeLabel={t.close} tone="gold">
          <p className="text-sm text-stone-600">{fmt(t.limitBody, { limit: r.freeLimit })}</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setLimitOpen(false)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100">
              {t.close}
            </button>
            <Link href="/pricing" className="px-5 py-2.5 rounded-xl bg-ember hover:bg-ember-dark text-white text-xs font-extrabold shadow inline-flex items-center gap-1.5">
              <Crown className="w-4 h-4" aria-hidden />
              {t.viewPlans}
            </Link>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-5 inset-x-0 z-50 flex justify-center px-4 pointer-events-none" role="status" aria-live="polite">
          <div className="bg-ink text-white border border-gold/50 px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden />
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}

function Kpi({ label, value, unit, accent }: { label: string; value: number | string; unit?: string; accent?: boolean }) {
  return (
    <div className="bg-white p-3 rounded-2xl border border-line">
      <span className="text-[11px] font-bold text-stone-500 block">{label}</span>
      <span className={`text-2xl font-extrabold ${accent ? "text-ember" : "text-ink"}`}>
        {value} {unit && <span className="text-xs font-bold">{unit}</span>}
      </span>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-stone-100 text-stone-600 border border-stone-200">{children}</span>;
}

function WalkInModal({
  t,
  locale,
  sections,
  onClose,
  onAdded,
}: {
  t: Dict;
  locale: Locale;
  sections: HostSnapshot["restaurant"]["sections"];
  onClose: () => void;
  onAdded: (ticketNumber: number, name: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setBusy(true);
    setError(false);
    const body = Object.fromEntries(new FormData(ev.currentTarget));
    const res = await fetch("/api/host/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (res?.ok) {
      const { ticketNumber, name } = (await res.json()) as { ticketNumber: number; name: string };
      onAdded(ticketNumber, name);
    } else {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <Modal title={t.walkInTitle} onClose={onClose} closeLabel={t.close}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block text-xs font-bold text-stone-700 mb-1">{t.guestName}</span>
          <input name="name" required maxLength={60} className={input} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-bold text-stone-700 mb-1">{t.partySize}</span>
            <select name="partySize" defaultValue="2" className={`${input} font-bold`}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n} {t.guests}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-stone-700 mb-1">{t.section}</span>
            <select name="sectionId" className={`${input} font-bold`}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s[locale] || s.en}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-stone-700 mb-1">{t.guestLanguage}</span>
            <select name="lang" defaultValue={locale} className={`${input} font-bold`}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-stone-700 mb-1">{t.phoneOptional}</span>
            <input name="phone" type="tel" dir="ltr" maxLength={20} className={input} />
          </label>
        </div>
        {error && <p className="text-sm text-red-700 font-semibold">{t.errorGeneric}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100">
            {t.cancel}
          </button>
          <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-xl bg-ember hover:bg-ember-dark disabled:opacity-60 text-white text-xs font-extrabold shadow">
            {t.addToQueue}
          </button>
        </div>
      </form>
    </Modal>
  );
}
