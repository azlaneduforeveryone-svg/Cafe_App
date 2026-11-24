"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, History, Mail, MessageCircle, MonitorSmartphone, Trash2, UserPlus, Users } from "lucide-react";
import { fmt } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { money } from "@/lib/pricing";
import { INVITABLE, canManageRole, type Role } from "@/lib/permissions";
import type { ActivityRow } from "@/lib/activity";
import type { PendingInvite, StaffMember } from "@/lib/staff";
import type { KitchenDevice } from "@/lib/kitchenDevice";
import type { Locale } from "@/lib/types";

const field = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm";
type Team = { staff: StaffMember[]; invites: PendingInvite[]; seats: { used: number; limit: number } };

async function call(body: unknown) {
  const res = await fetch("/api/host/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const out = res ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {};
  return { ok: !!res?.ok, out };
}

export function StaffAdmin({
  t,
  locale,
  myRole,
  isPro,
  currency,
  waiterScope,
  initial,
  activity,
  devices: initialDevices,
}: {
  t: Dict;
  locale: Locale;
  myRole: Role;
  isPro: boolean;
  currency: string;
  waiterScope: "all" | "assigned";
  initial: Team;
  activity: ActivityRow[];
  devices: KitchenDevice[];
}) {
  const [devices, setDevices] = useState(initialDevices);
  const d = t as unknown as Record<string, string>;
  const [team, setTeam] = useState(initial);
  const [scope, setScope] = useState(waiterScope);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [role, setRole] = useState<Role>("waiter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ link: string; share: string; contactType: "email" | "phone"; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const roles = INVITABLE.filter((r) => canManageRole(myRole, r));
  const full = team.seats.used >= team.seats.limit;
  const roleName = (r: string) => d[`role_${r}`] ?? r;

  async function reload() {
    const res = await fetch("/api/host/staff").catch(() => null);
    if (res?.ok) setTeam((await res.json()) as Team);
  }
  const err = (code: unknown) => setError((typeof code === "string" && d[`staffErr_${code}`]) || t.errorGeneric);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await call({ action: "invite", name, contact, role });
    setBusy(false);
    if (!r.ok) return err(r.out.error);
    setMade({ link: String(r.out.link), share: String(r.out.share), contactType: r.out.contactType as "email" | "phone", name });
    setName("");
    setContact("");
    void reload();
  }

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl font-bold flex items-center gap-2">
            <Users className="w-7 h-7 text-ember" aria-hidden />
            {t.staffNav}
          </h1>
          <p className="text-sm text-stone-600 mt-1 max-w-xl">{t.staffIntro}</p>
        </div>
        <p className="px-3 py-2 rounded-xl bg-white border border-line text-sm font-bold">
          <bdi>{fmt(t.staffSeats, { used: team.seats.used, limit: team.seats.limit })}</bdi>
          {!isPro && (
            <Link href="/dashboard/billing" className="ms-2 text-ember underline text-xs">
              {t.upgrade}
            </Link>
          )}
        </p>
      </header>

      {error && (
        <p role="alert" className="p-3 rounded-xl bg-red-50 text-red-800 text-sm font-bold">
          {error}
        </p>
      )}

      {/* Invite */}
      <section className="p-5 rounded-2xl bg-white border border-line space-y-3">
        <h2 className="font-extrabold text-lg flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-ember" aria-hidden />
          {t.staffInvite}
        </h2>
        {made ? (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 space-y-3">
            <p className="font-extrabold text-emerald-900">{fmt(t.staffInviteReady, { name: made.name })}</p>
            <p className="text-xs text-emerald-900">{t.staffInviteOnce}</p>
            <div className="flex gap-2">
              <input readOnly value={made.link} dir="ltr" aria-label={t.staffInviteLink} className={`${field} font-mono text-xs`} onFocus={(e) => e.target.select()} />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(made.link).catch(() => null);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="px-3 rounded-xl bg-white border border-line text-sm font-bold inline-flex items-center gap-1.5 shrink-0"
              >
                {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
                {copied ? t.copied : t.copy}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={made.share} target="_blank" rel="noopener noreferrer" className={`px-4 py-2.5 rounded-xl text-white text-sm font-extrabold inline-flex items-center gap-2 ${made.contactType === "phone" ? "bg-[#1f9d55]" : "bg-ink"}`}>
                {made.contactType === "phone" ? <MessageCircle className="w-4 h-4" aria-hidden /> : <Mail className="w-4 h-4" aria-hidden />}
                {made.contactType === "phone" ? t.staffShareWhatsapp : t.staffShareEmail}
              </a>
              <button type="button" onClick={() => setMade(null)} className="px-4 py-2.5 rounded-xl bg-white border border-line text-sm font-bold">
                {t.staffInviteAnother}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={invite} className="grid sm:grid-cols-[1fr_1fr_10rem_auto] gap-2 items-end">
            <label className="text-sm font-bold space-y-1">
              <span>{t.staffName}</span>
              <input required value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={field} />
            </label>
            <label className="text-sm font-bold space-y-1">
              <span>{t.staffContact}</span>
              <input required value={contact} maxLength={120} dir="ltr" onChange={(e) => setContact(e.target.value)} placeholder="05XXXXXXXX / name@email.com" className={`${field} text-start`} />
            </label>
            <label className="text-sm font-bold space-y-1">
              <span>{t.staffRole}</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={field}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleName(r)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy || full} className="px-4 py-2.5 rounded-xl bg-ink text-white text-sm font-extrabold disabled:opacity-50">
              {t.staffCreateLink}
            </button>
          </form>
        )}
        <p className="text-xs text-stone-500">{full ? t.staffSeatsFull : t.staffInviteHelp}</p>
      </section>

      {/* Team */}
      <section className="p-5 rounded-2xl bg-white border border-line space-y-3">
        <h2 className="font-extrabold text-lg">{t.staffTeam}</h2>
        <ul className="divide-y divide-line">
          {team.staff.map((m) => {
            const manageable = !m.isMe && canManageRole(myRole, m.role);
            return (
              <li key={m.userId} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-extrabold">{m.name}</span>
                  {m.isMe && <span className="text-xs text-stone-500 ms-1">({t.staffYou})</span>}
                  <bdi dir="ltr" className="block text-xs text-stone-500">
                    {m.contact}
                  </bdi>
                </span>
                <span className="flex items-center gap-2">
                  {manageable ? (
                    <select
                      aria-label={t.staffRole}
                      value={m.role}
                      onChange={async (e) => {
                        const r = await call({ action: "role", userId: m.userId, role: e.target.value });
                        if (!r.ok) err(r.out.error);
                        void reload();
                      }}
                      className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm font-bold"
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {roleName(r)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${m.role === "owner" ? "bg-ink text-white" : "bg-cream border border-line"}`}>{roleName(m.role)}</span>
                  )}
                  {manageable && (
                    <button
                      type="button"
                      aria-label={t.staffRemove}
                      title={t.staffRemove}
                      onClick={async () => {
                        if (!confirm(fmt(t.staffRemoveConfirm, { name: m.name }))) return;
                        const r = await call({ action: "remove", userId: m.userId });
                        if (!r.ok) err(r.out.error);
                        void reload();
                      }}
                      className="p-2 rounded-lg text-stone-400 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {team.invites.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-extrabold text-stone-500 mb-1">{t.staffPending}</p>
            <ul className="space-y-1">
              {team.invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg bg-cream">
                  <span>
                    <b>{i.name}</b> · {roleName(i.role)} · <bdi dir="ltr">{i.contact}</bdi>
                  </span>
                  {canManageRole(myRole, i.role) && (
                    <button
                      type="button"
                      onClick={async () => {
                        await call({ action: "revoke", inviteId: i.id });
                        void reload();
                      }}
                      className="text-xs font-bold text-red-700"
                    >
                      {t.staffRevoke}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Waiter visibility */}
      <section className="p-5 rounded-2xl bg-white border border-line space-y-3">
        <h2 className="font-extrabold">{t.staffScopeTitle}</h2>
        <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label={t.staffScopeTitle}>
          {(["all", "assigned"] as const).map((v) => (
            <label key={v} className={`p-3 rounded-xl border cursor-pointer ${scope === v ? "border-ink bg-cream" : "border-line"}`}>
              <input
                type="radio"
                className="sr-only"
                name="scope"
                checked={scope === v}
                onChange={async () => {
                  const r = await call({ action: "scope", scope: v });
                  if (r.ok) setScope(v);
                  else err(r.out.error);
                }}
              />
              <span className="font-extrabold block">{v === "all" ? t.staffScopeAll : t.staffScopeAssigned}</span>
              <span className="text-xs text-stone-600">{v === "all" ? t.staffScopeAllHint : t.staffScopeAssignedHint}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Kitchen displays */}
      <section className="p-5 rounded-2xl bg-white border border-line space-y-3">
        <h2 className="font-extrabold flex items-center gap-2">
          <MonitorSmartphone className="w-5 h-5 text-ember" aria-hidden />
          {t.kdListTitle}
        </h2>
        <p className="text-xs text-stone-600">{t.kdListHelp}</p>
        {devices.length === 0 ? (
          <p className="text-sm text-stone-500">{t.kdNone}</p>
        ) : (
          <ul className="divide-y divide-line">
            {devices.map((dv) => (
              <li key={dv.id} className="py-2.5 flex items-center justify-between gap-3">
                <span>
                  <b>{dv.name}</b>
                  <span className="block text-xs text-stone-500">
                    <bdi>{dv.lastSeenAt ? fmt(t.kdLastSeen, { when: new Date(dv.lastSeenAt).toLocaleString(locale === "en" ? "en-GB" : `${locale}-u-nu-latn`, { dateStyle: "short", timeStyle: "short" }) }) : t.kdNeverSeen}</bdi>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(fmt(t.kdRevokeConfirm, { name: dv.name }))) return;
                    const res = await fetch(`/api/host/kitchen-device?id=${dv.id}`, { method: "DELETE" }).catch(() => null);
                    if (res?.ok) setDevices((x) => x.filter((y) => y.id !== dv.id));
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-700 hover:bg-red-50"
                >
                  {t.kdRevoke}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Roles explained */}
      <section className="p-5 rounded-2xl bg-white border border-line space-y-2">
        <h2 className="font-extrabold">{t.staffRolesTitle}</h2>
        <ul className="text-sm space-y-1.5">
          {(["owner", "manager", "reception", "waiter"] as const).map((r) => (
            <li key={r}>
              <b>{roleName(r)}:</b> {d[`roleHelp_${r}`]}
            </li>
          ))}
        </ul>
      </section>

      {/* Activity */}
      {activity.length > 0 && (
        <section className="p-5 rounded-2xl bg-white border border-line space-y-3">
          <h2 className="font-extrabold text-lg flex items-center gap-2">
            <History className="w-5 h-5 text-ember" aria-hidden />
            {t.staffActivity}
          </h2>
          <ul className="divide-y divide-line text-sm max-h-[32rem] overflow-y-auto">
            {activity.map((a) => {
              const det = a.detail as Record<string, unknown>;
              const amount = typeof det.total === "number" ? money(det.total, currency) : typeof det.to === "number" && typeof det.from === "number" ? `${money(det.from, currency)} → ${money(det.to, currency)}` : "";
              return (
                <li key={a.id} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="min-w-0">
                    <b>{a.staffName}</b> <span className="text-xs text-stone-500">({roleName(a.staffRole)})</span> {d[`act_${a.action}`] ?? a.action}{" "}
                    {a.target && <bdi className="font-bold">{a.target}</bdi>}
                    {amount && <bdi className="ms-1 text-stone-600 ltr">{amount}</bdi>}
                    {typeof det.table === "string" && det.table && <span className="ms-1 text-stone-600">· {det.table}</span>}
                  </span>
                  <bdi className="text-xs text-stone-500">{new Date(a.at).toLocaleString(locale === "en" ? "en-GB" : `${locale}-u-nu-latn`, { dateStyle: "short", timeStyle: "short" })}</bdi>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
