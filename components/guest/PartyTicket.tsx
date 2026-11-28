"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Brain, CheckCircle2, Clock, Eye, Utensils } from "lucide-react";
import { GuestFrame } from "./GuestFrame";
import { TriviaSheet } from "./TriviaSheet";
import { useBackClose } from "./useBackClose";
import { useLive, useNow } from "@/components/useLive";
import { playChime } from "@/lib/chime";
import { fmt, mmss } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { Locale, PartySnapshot } from "@/lib/types";

/**
 * The rest of the party's view, from a shared link (QA report SEC-10).
 * It can follow the place in line, see "table ready", and play trivia. It has no buttons that
 * change the ticket: leaving, "on my way" and ordering stay with the person who joined.
 */
export function PartyTicket({ t, locale, viewToken, initial }: { t: Dict; locale: Locale; viewToken: string; initial: PartySnapshot }) {
  const { data, connected, clockOffset } = useLive(`/api/party/${viewToken}`, initial);
  const now = useNow(clockOffset);
  const { entry: e, restaurant: r } = data;
  const [trivia, setTrivia] = useState(false);
  useBackClose(trivia, () => setTrivia(false));

  // Chime when the table becomes ready (and again if the host buzzes again).
  const lastBuzz = useRef(initial.entry.notifiedAt);
  useEffect(() => {
    if (e.notifiedAt && e.notifiedAt !== lastBuzz.current) playChime();
    lastBuzz.current = e.notifiedAt;
  }, [e.notifiedAt]);

  const ready = e.status === "notified";
  const left = e.notifiedAt ? r.gracePeriodMin * 60 - (now - e.notifiedAt) / 1000 : r.gracePeriodMin * 60;

  return (
    <GuestFrame t={t} locale={locale} restaurant={r} nowServing={data.nowServing} ready={ready}>
      {!connected && (
        <p role="status" className={`mb-3 text-center text-[11px] font-bold ${ready ? "text-emerald-100" : "text-amber-700"}`}>
          {t.reconnecting}
        </p>
      )}

      <p className={`mb-3 text-center text-[11px] font-bold flex items-center justify-center gap-1.5 ${ready ? "text-emerald-100" : "text-stone-500"}`}>
        <Eye className="w-3.5 h-3.5" aria-hidden />
        {t.partyViewNote}
      </p>

      {e.status === "waiting" && (
        <div className="flex-1 flex flex-col gap-4">
          <div className="bg-white rounded-3xl border border-line shadow-md overflow-hidden">
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
              <p className="mt-3 text-xs text-stone-500">{fmt(t.partyOf, { n: e.partySize })}</p>
            </div>
          </div>

          {data.triviaOn && (
            <button type="button" onClick={() => setTrivia(true)} className="w-full p-4 rounded-2xl bg-ink text-white flex items-center gap-3 text-start shadow-lg">
              <span className="w-11 h-11 rounded-xl bg-gold/20 flex items-center justify-center shrink-0">
                <Brain className="w-6 h-6 text-gold" aria-hidden />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-extrabold">{t.trvCtaWait}</span>
                <span className="block text-xs text-white/70">{t.trvCtaWaitSub}</span>
              </span>
            </button>
          )}
        </div>
      )}

      {ready && (
        <div className="flex-1 flex flex-col justify-center text-center gap-4 py-4" role="alert">
          <div className="w-20 h-20 rounded-full bg-white/20 mx-auto flex items-center justify-center animate-bounce">
            <Bell className="w-10 h-10 text-white" aria-hidden />
          </div>
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-black/25 text-xs font-extrabold mb-2 ltr">#{e.ticketNumber}</span>
            <h1 className="display text-3xl font-extrabold leading-tight">{t.readyTitle}</h1>
            <p className="text-sm text-emerald-100 mt-2 font-medium">{t.readySub}</p>
          </div>
          <div className="bg-black/25 rounded-2xl p-4 max-w-[240px] mx-auto border border-white/15">
            {left > 0 ? (
              <>
                <span className="block text-[10px] uppercase tracking-wider text-emerald-200 font-bold">{t.timeLeft}</span>
                <span className="text-3xl font-mono font-extrabold ltr" suppressHydrationWarning>
                  {mmss(left)}
                </span>
              </>
            ) : (
              <span className="text-sm font-bold">{t.timeUp}</span>
            )}
          </div>
          {e.onTheWay && (
            <p className="mx-auto py-2.5 px-4 rounded-2xl bg-white text-go font-extrabold text-xs inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" aria-hidden />
              {t.onWayConfirmed}
            </p>
          )}
        </div>
      )}

      {(e.status === "seated" || e.status === "no_show" || e.status === "left") && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-10">
          <span className="w-16 h-16 rounded-full bg-white border border-line flex items-center justify-center shadow-sm">
            {e.status === "seated" ? <Utensils className="w-7 h-7 text-ember" aria-hidden /> : <Clock className="w-7 h-7 text-stone-500" aria-hidden />}
          </span>
          <h1 className="display text-2xl font-bold">{e.status === "seated" ? t.partySeatedTitle : t.partyEndedTitle}</h1>
          <p className="text-sm text-stone-600 max-w-xs">
            {e.status === "seated" ? (e.tableLabel ? fmt(t.partySeatedAt, { t: e.tableLabel }) : t.partySeatedBody) : t.partyEndedBody}
          </p>
        </div>
      )}

      {trivia && e.status === "waiting" && (
        <TriviaSheet t={t} locale={locale} endpoint={`/api/party/${viewToken}/trivia`} goneText={t.trvWaitGone} intro={t.trvPartyJoinIntro} onClose={() => setTrivia(false)} />
      )}
    </GuestFrame>
  );
}
