"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BookOpen, CheckCircle2, Clock, Footprints, ShoppingBag, Smartphone, Utensils, Volume2 } from "lucide-react";
import { MenuSheet } from "./MenuSheet";
import { money } from "@/lib/pricing";
import { GuestFrame } from "./GuestFrame";
import { ticketKey } from "./JoinForm";
import { useLive, useNow } from "@/components/useLive";
import { playChime, unlockAudio } from "@/lib/chime";
import { fmt, mmss, restaurantName, sectionName } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { Locale, Order, TicketSnapshot } from "@/lib/types";

type WakeLockLike = { release: () => Promise<void> };
type NavWithWake = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> } };

export function TicketLive({ t, locale, token, initial }: { t: Dict; locale: Locale; token: string; initial: TicketSnapshot }) {
  const { data, connected, clockOffset, refresh } = useLive(`/api/ticket/${token}`, initial);
  const now = useNow(clockOffset);
  const { entry: e, restaurant: r } = data;
  const slug = r.slug;

  const [alertsOn, setAlertsOn] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastBuzz = useRef(initial.entry.notifyCount);
  const wakeLock = useRef<WakeLockLike | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // The user agent only exists in the browser, so this runs after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsIOS(/iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);

  // Chime, vibrate and notify each time the host buzzes.
  useEffect(() => {
    if (e.notifyCount > lastBuzz.current) {
      playChime();
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        new Notification(t.readyTitle, { body: t.readySub, tag: `tp-${token}` });
      }
    }
    lastBuzz.current = e.notifyCount;
  }, [e.notifyCount, t.readyTitle, t.readySub, token]);

  // Closed tickets no longer need to be remembered on this phone.
  useEffect(() => {
    if (e.status === "seated" || e.status === "no_show" || e.status === "left") {
      try {
        localStorage.removeItem(ticketKey(slug));
      } catch {}
      void wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    }
  }, [e.status, slug]);

  // Screen wake lock is dropped when the tab is hidden; take it back on return.
  useEffect(() => {
    if (!alertsOn) return;
    const onVisible = async () => {
      if (document.visibilityState === "visible" && !wakeLock.current) {
        wakeLock.current = (await (navigator as NavWithWake).wakeLock?.request("screen").catch(() => null)) ?? null;
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [alertsOn]);

  async function enableAlerts() {
    unlockAudio();
    try {
      wakeLock.current = (await (navigator as NavWithWake).wakeLock?.request("screen")) ?? null;
    } catch {}
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission().catch(() => {});
    }
    setAlertsOn(true);
  }

  async function send(action: "on_way" | "leave") {
    setBusy(true);
    await fetch(`/api/ticket/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    await refresh();
    setBusy(false);
    setConfirmLeave(false);
  }

  const ready = e.status === "notified";
  const left = e.notifiedAt ? r.gracePeriodMin * 60 - (now - e.notifiedAt) / 1000 : r.gracePeriodMin * 60;

  return (
    <GuestFrame t={t} locale={locale} restaurant={r} nowServing={data.nowServing} ready={ready}>
      {!connected && (
        <p role="status" className={`mb-3 text-center text-[11px] font-bold ${ready ? "text-emerald-100" : "text-amber-700"}`}>
          {t.reconnecting}
        </p>
      )}

      {e.status === "waiting" && (
        <div className="flex-1 flex flex-col justify-between gap-4">
          <div className="bg-white rounded-3xl border border-line shadow-md overflow-hidden animate-ticket-float">
            <div className="bg-ink text-white px-5 py-3 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gold">{t.ticket}</span>
              <span className="font-mono font-extrabold text-sm ltr">#{e.ticketNumber}</span>
            </div>

            <div className="p-5 text-center" aria-live="polite">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">{t.placeInLine}</p>
              <div className="my-2 inline-flex items-center justify-center w-24 h-24 rounded-full bg-cream border-4 border-gold shadow-inner">
                <span className="display text-4xl font-extrabold ltr">{data.position}</span>
              </div>
              <p className="text-sm font-bold text-stone-700">{data.ahead === 0 ? t.aheadNone : fmt(t.ahead, { n: data.ahead })}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-gold/40 text-xs font-bold">
                <Clock className="w-3.5 h-3.5 text-ember" aria-hidden />
                {t.estWait}: ~{data.eta} {t.min}
              </div>
            </div>

            <div className="relative flex items-center my-1" aria-hidden>
              <div className="w-5 h-5 rounded-full bg-cream border border-line -ms-2.5" />
              <div className="flex-1 border-t-2 border-dashed border-line" />
              <div className="w-5 h-5 rounded-full bg-cream border border-line -me-2.5" />
            </div>

            <dl className="px-5 py-3.5 text-xs space-y-1.5">
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">{t.yourName}</dt>
                <dd className="font-bold">{e.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-stone-500">{fmt(t.partyOf, { n: e.partySize })}</dt>
                <dd className="font-bold">{sectionName(r.sections, e.sectionId, locale)}</dd>
              </div>
            </dl>
          </div>

          {(data.hasMenu || data.order) && (
            <OrderCard
              t={t}
              order={data.order}
              currency={data.currency}
              hasMenu={data.hasMenu}
              onOpenMenu={() => setShowMenu(true)}
              onCancel={async () => {
                await fetch(`/api/ticket/${token}/order`, { method: "DELETE" }).catch(() => null);
                await refresh();
              }}
            />
          )}

          <div className="space-y-2">
            <div className="p-3 rounded-2xl bg-white/80 border border-line text-[11px] text-stone-600 flex items-start gap-2.5">
              <span className="w-2.5 h-2.5 mt-0.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" aria-hidden />
              <span>{t.keepOpen}</span>
            </div>
            {isIOS && (
              <p className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <Smartphone className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                {t.iosTip}
              </p>
            )}
          </div>

          <div className="space-y-2">
            {alertsOn ? (
              <p className="py-2.5 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 text-center">{t.alertsOn}</p>
            ) : (
              <button type="button" onClick={enableAlerts} className="w-full py-3 px-3 rounded-xl bg-ink hover:bg-stone-800 text-xs font-bold text-white flex items-center justify-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-gold" aria-hidden />
                {t.enableAlerts}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                playChime();
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-white border border-line hover:bg-stone-50 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Volume2 className="w-3.5 h-3.5 text-ember" aria-hidden />
              {t.testChime}
            </button>
            {confirmLeave ? (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs space-y-2">
                <p className="font-semibold text-red-900">{t.leaveConfirm}</p>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setConfirmLeave(false)} className="px-3 py-1.5 rounded-lg font-bold text-stone-600 hover:bg-white">
                    {t.cancel}
                  </button>
                  <button type="button" disabled={busy} onClick={() => send("leave")} className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold disabled:opacity-60">
                    {t.leaveLine}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmLeave(true)} className="w-full py-2 text-xs font-semibold text-stone-500 hover:text-red-600">
                {t.leaveLine}
              </button>
            )}
          </div>
        </div>
      )}

      {ready && (
        <div className="flex-1 flex flex-col justify-between text-center py-4" role="alert">
          <div className="space-y-4 my-auto">
            <div className="w-20 h-20 rounded-full bg-white/20 mx-auto flex items-center justify-center animate-bounce">
              <Bell className="w-10 h-10 text-white" aria-hidden />
            </div>
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-black/25 text-xs font-extrabold mb-2">
                <span className="ltr">#{e.ticketNumber}</span> • {e.name}
              </span>
              <h1 className="display text-3xl font-extrabold leading-tight">{t.readyTitle}</h1>
              <p className="text-sm text-emerald-100 mt-2 font-medium">{t.readySub}</p>
            </div>
            <div className="bg-black/25 rounded-2xl p-4 max-w-[240px] mx-auto border border-white/15">
              {left > 0 ? (
                <>
                  <span className="block text-[10px] uppercase tracking-wider text-emerald-200 font-bold">{t.timeLeft}</span>
                  <span className="text-3xl font-mono font-extrabold ltr" suppressHydrationWarning>{mmss(left)}</span>
                </>
              ) : (
                <span className="text-sm font-bold">{t.timeUp}</span>
              )}
            </div>
          </div>
          {data.order && data.order.status !== "cancelled" && (
            <p className="mt-4 mx-auto max-w-[260px] text-xs font-bold bg-black/20 rounded-xl px-3 py-2 flex items-center justify-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5" aria-hidden />
              {data.order.status === "accepted" ? t.statusAccepted : t.statusSubmitted} · <span className="ltr">{money(data.order.total, data.currency)}</span>
            </p>
          )}
          <div className="pt-4">
            {e.onTheWay ? (
              <p className="py-3.5 px-4 rounded-2xl bg-white text-go font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg">
                <CheckCircle2 className="w-4 h-4" aria-hidden />
                {t.onWayConfirmed}
              </p>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => send("on_way")}
                className="w-full py-4 px-4 rounded-2xl bg-white hover:bg-emerald-50 text-go font-extrabold text-sm shadow-xl active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2"
              >
                <Footprints className="w-4 h-4" aria-hidden />
                {t.onMyWay}
              </button>
            )}
          </div>
        </div>
      )}

      {(e.status === "seated" || e.status === "no_show" || e.status === "left") && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-10">
          <span className="w-16 h-16 rounded-full bg-white border border-line flex items-center justify-center shadow-sm">
            {e.status === "seated" ? <Utensils className="w-7 h-7 text-ember" aria-hidden /> : <Clock className="w-7 h-7 text-stone-500" aria-hidden />}
          </span>
          <h1 className="display text-2xl font-bold">{e.status === "seated" ? t.seatedTitle : e.status === "no_show" ? t.noShowTitle : t.leftTitle}</h1>
          <p className="text-sm text-stone-600 max-w-xs">
            {e.status === "seated" ? fmt(t.seatedBody, { name: restaurantName(r, locale) }) : e.status === "no_show" ? t.noShowBody : t.leftBody}
          </p>
          {e.status !== "seated" && (
            <Link href={`/r/${slug}`} className="px-5 py-3 rounded-2xl bg-ember hover:bg-ember-dark text-white font-extrabold text-sm shadow-lg">
              {t.joinAgain}
            </Link>
          )}
        </div>
      )}
      {showMenu && (
        <MenuSheet
          t={t}
          locale={locale}
          token={token}
          order={data.order}
          onClose={() => setShowMenu(false)}
          onSent={() => void refresh()}
        />
      )}
    </GuestFrame>
  );
}

function OrderCard({
  t,
  order,
  currency,
  hasMenu,
  onOpenMenu,
  onCancel,
}: {
  t: Dict;
  order: Order | null;
  currency: string;
  hasMenu: boolean;
  onOpenMenu: () => void;
  onCancel: () => void;
}) {
  const active = order && order.status !== "cancelled";
  if (!active) {
    return (
      <div className="space-y-1.5">
        {order?.status === "cancelled" && <p className="text-[11px] font-semibold text-stone-500 text-center">{t.yourOrder}: {t.statusCancelled}</p>}
        {hasMenu && (
          <button
            type="button"
            onClick={onOpenMenu}
            className="w-full py-3 px-3 rounded-2xl bg-white border-2 border-gold hover:bg-amber-50 text-sm font-extrabold flex items-center justify-center gap-2"
          >
            <BookOpen className="w-4 h-4 text-ember" aria-hidden />
            {t.viewMenu}
          </button>
        )}
      </div>
    );
  }
  const count = order.items.reduce((n, l) => n + l.qty, 0);
  const accepted = order.status === "accepted";
  return (
    <div className={`p-3.5 rounded-2xl border ${accepted ? "bg-emerald-50 border-emerald-300" : "bg-white border-gold"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-extrabold flex items-center gap-1.5">
          <ShoppingBag className="w-4 h-4 text-ember" aria-hidden />
          {t.yourOrder}
        </span>
        <span className="text-xs font-extrabold ltr">{money(order.total, currency)}</span>
      </div>
      <p className={`text-xs font-bold mt-1 ${accepted ? "text-emerald-800" : "text-amber-800"}`}>
        {accepted ? t.statusAccepted : t.statusSubmitted} · {fmt(t.itemsCount, { n: count })}
      </p>
      <div className="flex gap-2 mt-2.5">
        <button type="button" onClick={onOpenMenu} className="flex-1 py-2 rounded-xl bg-ink text-white text-xs font-bold">
          {accepted ? t.viewMenu : t.editOrder}
        </button>
        {!accepted && (
          <button type="button" onClick={onCancel} className="px-3 py-2 rounded-xl text-xs font-bold text-stone-600 hover:text-red-700 hover:bg-red-50">
            {t.cancelPreOrder}
          </button>
        )}
      </div>
    </div>
  );
}
