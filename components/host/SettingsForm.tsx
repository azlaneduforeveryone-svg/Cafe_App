"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import type { Section } from "@/lib/types";

const input = "w-full px-3 py-2.5 rounded-xl bg-white border border-line text-sm focus:outline-none focus:ring-2 focus:ring-ember";

interface Values {
  name: string;
  nameAr: string;
  nameUr: string;
  sections: Section[];
  gracePeriodMin: number;
  minutesPerParty: number;
}

export function SettingsForm({ t, initial }: { t: Dict; initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState<Values>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const set = <K extends keyof Values>(k: K, val: Values[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setState("idle");
  };
  const setSection = (i: number, patch: Partial<Section>) =>
    set(
      "sections",
      v.sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const res = await fetch("/api/host/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    }).catch(() => null);
    setState(res?.ok ? "saved" : "error");
    if (res?.ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Card title={t.namesTitle}>
        <div className="grid sm:grid-cols-3 gap-3">
          <Labeled label={t.nameEn}>
            <input required maxLength={80} value={v.name} onChange={(e) => set("name", e.target.value)} dir="ltr" className={input} />
          </Labeled>
          <Labeled label={t.nameAr}>
            <input maxLength={80} value={v.nameAr} onChange={(e) => set("nameAr", e.target.value)} dir="rtl" lang="ar" className={input} />
          </Labeled>
          <Labeled label={t.nameUr}>
            <input maxLength={80} value={v.nameUr} onChange={(e) => set("nameUr", e.target.value)} dir="rtl" lang="ur" className={input} />
          </Labeled>
        </div>
      </Card>

      <Card title={t.sectionsTitle} help={t.sectionsHelp}>
        <div className="space-y-2">
          {v.sections.map((s, i) => (
            <div key={s.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <input aria-label={`${t.nameEn} ${i + 1}`} required maxLength={40} value={s.en} onChange={(e) => setSection(i, { en: e.target.value })} dir="ltr" className={input} placeholder={t.nameEn} />
              <input aria-label={`${t.nameAr} ${i + 1}`} maxLength={40} value={s.ar} onChange={(e) => setSection(i, { ar: e.target.value })} dir="rtl" className={input} placeholder={t.nameAr} />
              <input aria-label={`${t.nameUr} ${i + 1}`} maxLength={40} value={s.ur} onChange={(e) => setSection(i, { ur: e.target.value })} dir="rtl" className={input} placeholder={t.nameUr} />
              <button
                type="button"
                aria-label={t.remove}
                title={t.remove}
                disabled={v.sections.length <= 1}
                onClick={() => set("sections", v.sections.filter((_, idx) => idx !== i))}
                className="p-2 rounded-lg text-stone-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-30"
              >
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
        {v.sections.length < 12 && (
          <button
            type="button"
            onClick={() => set("sections", [...v.sections, { id: `s-${Date.now().toString(36)}`, en: "", ar: "", ur: "" }])}
            className="mt-3 px-3 py-2 rounded-xl bg-cream border border-line hover:border-stone-400 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {t.addSection}
          </button>
        )}
      </Card>

      <Card title={t.timingTitle}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Labeled label={t.graceLabel} help={t.graceHelp}>
            <input type="number" onWheel={(e) => e.currentTarget.blur()} min={1} max={30} required value={v.gracePeriodMin} onChange={(e) => set("gracePeriodMin", Number(e.target.value))} className={input} />
          </Labeled>
          <Labeled label={t.turnLabel} help={t.turnHelp}>
            <input type="number" onWheel={(e) => e.currentTarget.blur()} min={1} max={60} required value={v.minutesPerParty} onChange={(e) => set("minutesPerParty", Number(e.target.value))} className={input} />
          </Labeled>
        </div>
      </Card>

      <div className="p-4 rounded-2xl bg-white border border-line flex items-start gap-3">
        <MessageSquare className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden />
        <div>
          <p className="font-extrabold text-sm">{t.whatsappTitle}</p>
          <p className="text-xs text-stone-500">{t.whatsappBody}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={state === "saving"} className="px-5 py-3 rounded-xl bg-ember hover:bg-ember-dark disabled:opacity-60 text-white text-sm font-extrabold shadow">
          {state === "saving" ? t.saving : t.save}
        </button>
        {state === "saved" && <span role="status" className="text-sm font-bold text-emerald-700">{t.saved}</span>}
        {state === "error" && <span role="alert" className="text-sm font-bold text-red-700">{t.errorGeneric}</span>}
      </div>
    </form>
  );
}

function Card({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <fieldset className="bg-white rounded-3xl border border-line shadow-sm p-5">
      <legend className="sr-only">{title}</legend>
      <h2 className="font-extrabold text-sm">{title}</h2>
      {help && <p className="text-xs text-stone-500 mt-0.5">{help}</p>}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

function Labeled({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-stone-700 mb-1">{label}</span>
      {children}
      {help && <span className="block text-[11px] text-stone-500 mt-1">{help}</span>}
    </label>
  );
}
