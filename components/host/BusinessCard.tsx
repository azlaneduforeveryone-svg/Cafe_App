"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import type { Dict } from "@/lib/i18n";

const input = "w-full px-3 py-2.5 rounded-xl bg-white border border-line text-sm focus:outline-none focus:ring-2 focus:ring-ember";
type State = "idle" | "saving" | "saved" | string;

/** Guest-facing contact for owner and manager; the legal block is only rendered (and only sent) for the owner. */
export function BusinessCard({ t, contact, legal }: { t: Dict; contact: { phone: string; address: string; city: string }; legal: { legalName: string; crNumber: string; vatNumber: string } | null }) {
  return (
    <div className="space-y-5">
      <Form t={t} method="PUT" title={t.bizContactTitle} help={t.bizContactHelp}>
        <Field label={t.bizPhone} name="phone" defaultValue={contact.phone ? `+${contact.phone}` : ""} maxLength={40} inputMode="tel" ltr />
        <Field label={t.bizCity} name="city" defaultValue={contact.city} maxLength={60} />
        <div className="sm:col-span-2">
          <Field label={t.bizAddress} name="address" defaultValue={contact.address} maxLength={200} />
        </div>
      </Form>
      {legal && (
        <Form t={t} method="PATCH" title={t.bizLegalTitle} help={t.bizLegalHelp} locked>
          <div className="sm:col-span-2">
            <Field label={t.bizLegalName} name="legalName" defaultValue={legal.legalName} maxLength={120} />
          </div>
          <Field label={t.bizCr} name="crNumber" defaultValue={legal.crNumber} maxLength={30} pattern="[A-Za-z0-9-]*" ltr />
          <Field label={t.bizVat} name="vatNumber" defaultValue={legal.vatNumber} maxLength={30} pattern="[A-Za-z0-9-]*" ltr />
        </Form>
      )}
    </div>
  );
}

function Form({ t, method, title, help, locked, children }: { t: Dict; method: "PUT" | "PATCH"; title: string; help: string; locked?: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const d = t as unknown as Record<string, string>;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("saving");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/host/business", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (res?.ok) {
      setState("saved");
      router.refresh();
      return;
    }
    const out = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
    setState((out.error && d[`bizErr_${out.error}`]) || t.errorGeneric);
  }

  return (
    <form onSubmit={save} onChange={() => state !== "saving" && setState("idle")} className="bg-white rounded-3xl border border-line shadow-sm p-5 space-y-3">
      <div>
        <h2 className="font-extrabold text-sm flex items-center gap-1.5">
          {locked && <Lock className="w-3.5 h-3.5 text-ember" aria-hidden />}
          {title}
        </h2>
        <p className="text-xs text-stone-500 mt-0.5">{help}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={state === "saving"} className="px-4 py-2.5 rounded-xl bg-ink text-white text-xs font-extrabold disabled:opacity-60">
          {state === "saving" ? t.saving : t.save}
        </button>
        {state === "saved" && <span className="text-xs font-bold text-emerald-700">{t.saved}</span>}
        {state !== "idle" && state !== "saving" && state !== "saved" && (
          <span role="alert" className="text-xs font-bold text-red-700">
            {state}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({ label, ltr, ...rest }: { label: string; ltr?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold">{label}</span>
      <input {...rest} dir={ltr ? "ltr" : "auto"} className={input} />
    </label>
  );
}
