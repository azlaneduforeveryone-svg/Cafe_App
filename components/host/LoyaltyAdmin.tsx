"use client";

import { useState } from "react";
import Link from "next/link";
import { Crown, Gift, Plus, Search, Trash2 } from "lucide-react";
import { fmt, tr } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { money } from "@/lib/pricing";
import type { Locale, LoyaltyMemberRow, LoyaltyMode, LoyaltyReward, LoyaltySettings } from "@/lib/types";

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const out = res ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {};
  return { ok: !!res?.ok, out };
}

const field = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm";

export function LoyaltyAdmin({
  t,
  locale,
  owner,
  isPro,
  currency,
  settings,
  initialRewards,
  initialMembers,
  stats,
}: {
  t: Dict;
  locale: Locale;
  owner: boolean;
  isPro: boolean;
  currency: string;
  settings: LoyaltySettings;
  initialRewards: LoyaltyReward[];
  initialMembers: { members: LoyaltyMemberRow[]; total: number };
  stats: { members: number; earnedToday: number; redeemedToday: number };
}) {
  const [mode, setMode] = useState<LoyaltyMode>(settings.savedMode);
  const [stampsNeeded, setStampsNeeded] = useState(String(settings.stampsNeeded));
  const [minSpend, setMinSpend] = useState(String(settings.stampMinSpend));
  const [perPoint, setPerPoint] = useState(String(settings.spendPerPoint));
  const [rewards, setRewards] = useState(initialRewards);
  const [members, setMembers] = useState(initialMembers);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const kind = mode === "points" ? "points" : "stamps";
  const shown = rewards.filter((w) => w.kind === kind);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3000);
  };

  async function saveSettings() {
    setBusy(true);
    const r = await call("/api/host/loyalty/settings", "PUT", { mode, stampsNeeded: Number(stampsNeeded), stampMinSpend: Number(minSpend || 0), spendPerPoint: Number(perPoint) });
    setBusy(false);
    if (r.ok) {
      flash(true, t.saved);
      if (mode === "stamps") setRewards((list) => list.map((w) => (w.kind === "stamps" ? { ...w, cost: Number(stampsNeeded) } : w)));
    } else flash(false, r.out.error === "pro_required" ? t.loyProRequired : t.loyInvalid);
  }

  async function reloadRewards() {
    const res = await fetch("/api/host/loyalty/rewards").catch(() => null);
    if (res?.ok) setRewards(((await res.json()) as { rewards: LoyaltyReward[] }).rewards);
  }

  async function findMembers(q: string) {
    const res = await fetch(`/api/host/loyalty/members?q=${encodeURIComponent(q)}`).catch(() => null);
    if (res?.ok) setMembers((await res.json()) as { members: LoyaltyMemberRow[]; total: number });
  }

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl font-bold flex items-center gap-2">
            <Gift className="w-7 h-7 text-ember" aria-hidden />
            {t.loyaltyNav}
          </h1>
          <p className="text-sm text-stone-600 mt-1 max-w-xl">{t.loyIntro}</p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            [t.loyStatMembers, stats.members],
            [t.loyStatEarned, stats.earnedToday],
            [t.loyStatRedeemed, stats.redeemedToday],
          ].map(([label, n]) => (
            <div key={String(label)} className="px-3 py-2 rounded-xl bg-white border border-line">
              <dt className="text-[11px] font-bold text-stone-500">{label}</dt>
              <dd className="text-xl font-extrabold">{n}</dd>
            </div>
          ))}
        </dl>
      </header>

      {!isPro && (
        <p className="p-3 rounded-xl bg-amber-50 border border-gold text-sm font-bold flex flex-wrap items-center gap-2">
          <Crown className="w-4 h-4 text-gold" aria-hidden />
          {t.loyProRequired}
          <Link href="/dashboard/billing" className="underline">
            {t.upgrade}
          </Link>
        </p>
      )}

      {msg && (
        <p role="status" className={`p-3 rounded-xl text-sm font-bold ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
          {msg.text}
        </p>
      )}

      {/* Programme */}
      <section className="p-5 rounded-2xl bg-white border border-line space-y-4">
        <h2 className="font-extrabold text-lg">{t.loyProgramme}</h2>
        <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label={t.loyProgramme}>
          {(["off", "stamps", "points"] as const).map((m) => (
            <label key={m} className={`p-3 rounded-xl border cursor-pointer ${mode === m ? "border-ink bg-cream" : "border-line"} ${!owner ? "opacity-60" : ""}`}>
              <input type="radio" name="mode" className="sr-only" checked={mode === m} disabled={!owner} onChange={() => setMode(m)} />
              <span className="font-extrabold block">{m === "off" ? t.loyModeOff : m === "stamps" ? t.loyModeStamps : t.loyModePoints}</span>
              <span className="text-xs text-stone-600">{m === "off" ? t.loyModeOffHint : m === "stamps" ? t.loyModeStampsHint : t.loyModePointsHint}</span>
            </label>
          ))}
        </div>
        {mode === "stamps" && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm font-bold space-y-1">
              <span>{t.loyStampsNeeded}</span>
              <input type="number" min={3} max={20} value={stampsNeeded} disabled={!owner} onChange={(e) => setStampsNeeded(e.target.value)} className={field} />
            </label>
            <label className="text-sm font-bold space-y-1">
              <span>{fmt(t.loyMinSpendLabel, { c: currency })}</span>
              <input type="number" min={0} step="0.5" value={minSpend} disabled={!owner} onChange={(e) => setMinSpend(e.target.value)} className={field} />
            </label>
          </div>
        )}
        {mode === "points" && (
          <label className="text-sm font-bold space-y-1 block max-w-xs">
            <span>{fmt(t.loySpendPerPoint, { c: currency })}</span>
            <input type="number" min={1} step="1" value={perPoint} disabled={!owner} onChange={(e) => setPerPoint(e.target.value)} className={field} />
            <span className="block text-xs font-normal text-stone-500">{fmt(t.loyPerPointHint, { amount: money(Number(perPoint) || 0, currency) })}</span>
          </label>
        )}
        <p className="text-xs text-stone-500">{t.loySafety}</p>
        {owner && (
          <button type="button" disabled={busy} onClick={saveSettings} className="px-5 py-2.5 rounded-xl bg-ink text-white font-extrabold text-sm disabled:opacity-60">
            {t.save}
          </button>
        )}
      </section>

      {/* Rewards */}
      {mode !== "off" && (
        <section className="p-5 rounded-2xl bg-white border border-line space-y-3">
          <h2 className="font-extrabold text-lg">{t.loyRewards}</h2>
          {shown.length === 0 && <p className="text-sm text-stone-500">{t.loyNoRewards}</p>}
          <ul className="space-y-2">
            {shown.map((w) => (
              <RewardRow key={w.id} t={t} locale={locale} owner={owner} reward={w} stampCost={kind === "stamps" ? Number(stampsNeeded) : null} onSaved={reloadRewards} onError={() => flash(false, t.loyInvalid)} />
            ))}
          </ul>
          {owner && <RewardRow t={t} locale={locale} owner reward={null} kind={kind} stampCost={kind === "stamps" ? Number(stampsNeeded) : null} onSaved={reloadRewards} onError={() => flash(false, t.loyInvalid)} />}
        </section>
      )}

      {/* Members */}
      {owner && (
        <section className="p-5 rounded-2xl bg-white border border-line space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-extrabold text-lg">
              {t.loyMembers} <span className="text-stone-500 text-sm">({members.total})</span>
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void findMembers(search);
              }}
              className="flex gap-2"
            >
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.loySearch} aria-label={t.loySearch} className={`${field} w-56`} />
              <button type="submit" aria-label={t.loySearch} className="px-3 rounded-xl bg-ink text-white">
                <Search className="w-4 h-4" aria-hidden />
              </button>
            </form>
          </div>
          <p className="text-xs text-stone-500">{t.loyMembersPrivacy}</p>
          {members.members.length === 0 ? (
            <p className="text-sm text-stone-500 py-4 text-center">{t.loyNoMembers}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs text-stone-500 border-b border-line">
                    <th className="py-2 text-start font-bold">{t.loyColName}</th>
                    <th className="py-2 text-start font-bold">{t.loyColPhone}</th>
                    <th className="py-2 text-end font-bold">{kind === "points" ? t.loyColPoints : t.loyColStamps}</th>
                    <th className="py-2 text-end font-bold">{t.loyColVisits}</th>
                    <th className="py-2 text-end font-bold">{t.loyColLast}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {members.members.map((m) => (
                    <tr key={m.id} className="border-b border-line last:border-0">
                      <td className="py-2 font-bold">{m.name || "–"}</td>
                      <td className="py-2">
                        <bdi dir="ltr">+{m.phone}</bdi>
                      </td>
                      <td className="py-2 text-end font-extrabold">{kind === "points" ? m.points : m.stamps}</td>
                      <td className="py-2 text-end">{m.visits}</td>
                      <td className="py-2 text-end text-xs text-stone-600">
                        <bdi>{m.lastVisitAt ? new Date(m.lastVisitAt).toLocaleDateString(locale === "en" ? "en-GB" : `${locale}-u-nu-latn`) : "–"}</bdi>
                      </td>
                      <td className="py-2 text-end">
                        <button
                          type="button"
                          aria-label={t.loyDeleteMember}
                          title={t.loyDeleteMember}
                          onClick={async () => {
                            if (!confirm(t.loyDeleteConfirm)) return;
                            const r = await call(`/api/host/loyalty/members?id=${m.id}`, "DELETE");
                            if (r.ok) setMembers((x) => ({ total: x.total - 1, members: x.members.filter((y) => y.id !== m.id) }));
                          }}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function RewardRow({
  t,
  locale,
  owner,
  reward,
  kind,
  stampCost,
  onSaved,
  onError,
}: {
  t: Dict;
  locale: Locale;
  owner: boolean;
  reward: LoyaltyReward | null;
  kind?: "stamps" | "points";
  stampCost: number | null;
  onSaved: () => void;
  onError: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [en, setEn] = useState(reward?.nameEn ?? "");
  const [ar, setAr] = useState(reward && reward.nameAr !== reward.nameEn ? reward.nameAr : "");
  const [ur, setUr] = useState(reward && reward.nameUr !== reward.nameEn ? reward.nameUr : "");
  const [cost, setCost] = useState(String(reward?.cost ?? 50));
  const [active, setActive] = useState(reward?.active ?? true);
  const k = reward?.kind ?? kind ?? "stamps";

  if (!edit) {
    if (!reward)
      return (
        <button type="button" onClick={() => setEdit(true)} className="w-full py-2.5 rounded-xl border-2 border-dashed border-line text-sm font-bold text-stone-600 flex items-center justify-center gap-1.5 hover:border-ink">
          <Plus className="w-4 h-4" aria-hidden />
          {t.loyAddReward}
        </button>
      );
    return (
      <li className={`flex items-center justify-between gap-3 p-3 rounded-xl border border-line ${reward.active ? "" : "opacity-50"}`}>
        <span className="min-w-0">
          <span className="font-extrabold">{tr(reward, "name", locale)}</span>
          <span className="text-xs text-stone-600 ms-2">
            <bdi>{fmt(k === "stamps" ? t.loyCostStamps : t.loyCostPoints, { n: stampCost ?? reward.cost })}</bdi>
          </span>
          {!reward.active && <span className="text-xs ms-2">({t.loyInactive})</span>}
        </span>
        {owner && (
          <button type="button" onClick={() => setEdit(true)} className="px-3 py-1.5 rounded-lg border border-line text-xs font-bold">
            {t.edit}
          </button>
        )}
      </li>
    );
  }

  async function save() {
    const r = await call("/api/host/loyalty/rewards", "POST", { id: reward?.id, kind: k, nameEn: en, nameAr: ar, nameUr: ur, cost: Number(cost), active });
    if (!r.ok) return onError();
    setEdit(false);
    if (!reward) {
      setEn("");
      setAr("");
      setUr("");
    }
    onSaved();
  }

  return (
    <li className="p-3 rounded-xl border border-ink bg-cream space-y-2 list-none">
      <div className="grid sm:grid-cols-3 gap-2">
        <input value={en} onChange={(e) => setEn(e.target.value.slice(0, 60))} placeholder={t.loyRewardEn} aria-label={t.loyRewardEn} className={field} />
        <input value={ar} dir="rtl" onChange={(e) => setAr(e.target.value.slice(0, 60))} placeholder={t.loyRewardAr} aria-label={t.loyRewardAr} className={field} />
        <input value={ur} dir="rtl" onChange={(e) => setUr(e.target.value.slice(0, 60))} placeholder={t.loyRewardUr} aria-label={t.loyRewardUr} className={field} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {k === "points" ? (
          <label className="text-sm font-bold flex items-center gap-2">
            {t.loyCost}
            <input type="number" min={1} value={cost} onChange={(e) => setCost(e.target.value)} className={`${field} w-24`} />
          </label>
        ) : (
          <span className="text-xs text-stone-600">
            <bdi>{fmt(t.loyCostStamps, { n: stampCost ?? 8 })}</bdi>
          </span>
        )}
        <label className="text-sm font-bold flex items-center gap-1.5">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t.loyActive}
        </label>
        <span className="flex-1" />
        {reward && (
          <button
            type="button"
            onClick={async () => {
              if (!confirm(t.loyDeleteReward)) return;
              await call(`/api/host/loyalty/rewards?id=${reward.id}`, "DELETE");
              onSaved();
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700"
          >
            {t.delete}
          </button>
        )}
        <button type="button" onClick={() => setEdit(false)} className="px-3 py-1.5 rounded-lg border border-line text-xs font-bold bg-white">
          {t.cancel}
        </button>
        <button type="button" disabled={!en.trim()} onClick={save} className="px-4 py-1.5 rounded-lg bg-ink text-white text-xs font-bold disabled:opacity-40">
          {t.save}
        </button>
      </div>
    </li>
  );
}
