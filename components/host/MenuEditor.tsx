"use client";

import { useCallback, useRef, useState } from "react";
import { CalendarClock, ImagePlus, PackageCheck, PackageX, Pencil, Plus, Tag, Trash2, Utensils } from "lucide-react";
import { Modal } from "@/components/Modal";
import { uploadErrorText } from "./LogoCard";
import { MealTimesCard, SchedulePicker, scheduleSummary } from "./Schedule";
import { StationsCard } from "./StationsCard";
import { uploadImage } from "@/lib/image";
import { money } from "@/lib/pricing";
import { tr } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { ALLERGENS, SPICE_LEVELS, type Allergen, type Locale, type MealPeriod, type Menu, type MenuCategory, type MenuItem, type SpiceLevel, type Station } from "@/lib/types";

const input = "w-full px-3 py-2.5 rounded-xl bg-white border border-line text-sm focus:outline-none focus:ring-2 focus:ring-ember";
const LANGS: { key: "En" | "Ar" | "Ur"; dir: "ltr" | "rtl"; lang: string }[] = [
  { key: "En", dir: "ltr", lang: "en" },
  { key: "Ar", dir: "rtl", lang: "ar" },
  { key: "Ur", dir: "rtl", lang: "ur" },
];

function errorText(t: Dict, code?: string) {
  switch (code) {
    case "all_languages":
      return t.allLanguagesRequired;
    case "bad_price":
      return t.badPrice;
    case "bad_compare_price":
      return t.badComparePrice;
    case "bad_time":
      return t.badTime;
    case "bad_portions":
      return t.badPortions;
    default:
      return t.errorGeneric;
  }
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  const out = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : { error: "network" };
  return { ok: !!res?.ok, error: out.error };
}

export function MenuEditor({ t, locale, initial }: { t: Dict; locale: Locale; initial: Menu }) {
  const [menu, setMenu] = useState<Menu>(initial);
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [stockMenu, setStockMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/host/menu", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setMenu((await res.json()) as Menu);
  }, []);

  async function run(url: string, method: string, body?: unknown) {
    setError(null);
    const r = await send(url, method, body);
    if (!r.ok) setError(errorText(t, r.error));
    await reload();
    return r.ok;
  }

  const groups: { cat: MenuCategory | null; items: MenuItem[] }[] = [
    ...menu.categories.map((cat) => ({ cat, items: menu.items.filter((i) => i.categoryId === cat.id) })),
    { cat: null, items: menu.items.filter((i) => !i.categoryId || !menu.categories.some((c) => c.id === i.categoryId)) },
  ].filter((g) => g.cat || g.items.length);

  return (
    <div className="space-y-6">
      <MealTimesCard t={t} initial={menu.mealPeriods} onSaved={reload} />
      <StationsCard t={t} initial={menu.stations} onSaved={reload} />
      <Categories t={t} locale={locale} categories={menu.categories} meal={menu.mealPeriods} run={run} />

      <section className="bg-white rounded-3xl border border-line shadow-sm p-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="font-extrabold text-sm">{t.menuTitle}</h2>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="px-3.5 py-2 rounded-xl bg-ember hover:bg-ember-dark text-white text-xs font-extrabold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {t.addItem}
          </button>
        </div>
        {error && (
          <p role="alert" className="mb-3 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        {menu.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-500">{t.emptyMenuHost}</p>
        ) : (
          <div className="space-y-5">
            {groups.map(({ cat, items }) => (
              <div key={cat?.id ?? "none"}>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 mb-2">{cat ? tr(cat, "name", locale) : t.noCategory}</h3>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className={`p-3 rounded-2xl border flex items-center gap-3 ${item.inStock ? "border-line bg-white" : "border-dashed border-stone-300 bg-stone-50"}`}>
                      <Thumb url={item.imageUrl} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-extrabold text-sm truncate">{tr(item, "name", locale)}</span>
                          {item.isDeal && <DealBadge label={t.dealBadge} />}
                          {!item.inStock && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                              {t.soldOut}
                              {item.backAt ? ` · ${t.backAt.replace("{time}", timeLabel(item.backAt, locale))}` : ""}
                            </span>
                          )}
                          {item.inStock && !item.onSchedule && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-stone-200 text-stone-600">{t.notOnNow}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3">
                          <Price item={item} currency={menu.currency} />
                          {scheduleSummary(item.days, item.periods, menu.mealPeriods, locale) && (
                            <span className="text-[11px] text-stone-500 inline-flex items-center gap-1">
                              <CalendarClock className="w-3 h-3" aria-hidden />
                              {scheduleSummary(item.days, item.periods, menu.mealPeriods, locale)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 relative">
                        {item.inStock ? (
                          <IconButton label={t.markSoldOut} onClick={() => setStockMenu(stockMenu === item.id ? null : item.id)}>
                            <PackageX className="w-4 h-4" />
                          </IconButton>
                        ) : (
                          <button
                            type="button"
                            onClick={() => run(`/api/host/menu/items/${item.id}`, "PUT", { stock: "in" })}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1"
                          >
                            <PackageCheck className="w-3.5 h-3.5" aria-hidden />
                            <span className="hidden sm:inline">{t.backInStock}</span>
                          </button>
                        )}
                        {stockMenu === item.id && (
                          <div role="menu" className="absolute top-full end-0 mt-1 z-20 w-56 bg-white rounded-xl border border-line shadow-lg p-1.5">
                            <p className="px-2 py-1 text-[11px] font-bold text-stone-500">{t.markSoldOut}</p>
                            {(
                              [
                                ["out_today", t.soldOutToday],
                                ["out", t.soldOutUntilOn],
                              ] as const
                            ).map(([mode, label]) => (
                              <button
                                key={mode}
                                type="button"
                                role="menuitem"
                                onClick={async () => {
                                  setStockMenu(null);
                                  await run(`/api/host/menu/items/${item.id}`, "PUT", { stock: mode });
                                }}
                                className="w-full text-start px-2 py-2 rounded-lg text-sm font-semibold hover:bg-stone-100"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                        <IconButton label={t.edit} onClick={() => setEditing(item)}>
                          <Pencil className="w-4 h-4" />
                        </IconButton>
                        {confirmDelete === item.id ? (
                          <button
                            type="button"
                            onClick={async () => {
                              setConfirmDelete(null);
                              await run(`/api/host/menu/items/${item.id}`, "DELETE");
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold"
                          >
                            {t.delete}
                          </button>
                        ) : (
                          <IconButton label={t.delete} onClick={() => setConfirmDelete(item.id)} danger>
                            <Trash2 className="w-4 h-4" />
                          </IconButton>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <ItemModal
          t={t}
          locale={locale}
          item={editing === "new" ? null : editing}
          categories={menu.categories}
          meal={menu.mealPeriods}
          stations={menu.stations}
          allItems={menu.items}
          currency={menu.currency}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function Categories({
  t,
  locale,
  categories,
  meal,
  run,
}: {
  t: Dict;
  locale: Locale;
  categories: MenuCategory[];
  meal: MealPeriod[];
  run: (url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
  const empty = { nameEn: "", nameAr: "", nameUr: "" };
  const [draft, setDraft] = useState(empty);
  const [edits, setEdits] = useState<Record<string, typeof empty>>({});
  const [scheduling, setScheduling] = useState<MenuCategory | null>(null);

  return (
    <section className="bg-white rounded-3xl border border-line shadow-sm p-5">
      <h2 className="font-extrabold text-sm">{t.categoriesTitle}</h2>
      <p className="text-xs text-stone-500 mt-0.5 mb-3">{t.categoriesHelp}</p>
      <div className="space-y-2">
        {categories.map((c) => {
          const v = edits[c.id] ?? { nameEn: c.nameEn, nameAr: c.nameAr, nameUr: c.nameUr };
          const changed = v.nameEn !== c.nameEn || v.nameAr !== c.nameAr || v.nameUr !== c.nameUr;
          const summary = scheduleSummary(c.days, c.periods, meal, locale);
          return (
            <div key={c.id}>
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              {LANGS.map(({ key, dir, lang }) => (
                <input
                  key={key}
                  aria-label={`${t.categoriesTitle} ${lang}`}
                  value={v[`name${key}`]}
                  maxLength={40}
                  dir={dir}
                  lang={lang}
                  onChange={(e) => setEdits({ ...edits, [c.id]: { ...v, [`name${key}`]: e.target.value } })}
                  className={input}
                />
              ))}
              <div className="flex gap-1">
                {changed && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (await run(`/api/host/menu/categories/${c.id}`, "PUT", { ...v, days: c.days, periods: c.periods })) {
                        const next = { ...edits };
                        delete next[c.id];
                        setEdits(next);
                      }
                    }}
                    className="px-2.5 py-2 rounded-lg bg-ember text-white text-xs font-bold"
                  >
                    {t.save}
                  </button>
                )}
                <IconButton label={t.scheduleBtn} onClick={() => setScheduling(c)}>
                  <CalendarClock className={`w-4 h-4 ${summary ? "text-ember" : ""}`} />
                </IconButton>
                <IconButton label={t.delete} danger onClick={() => run(`/api/host/menu/categories/${c.id}`, "DELETE")}>
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            </div>
            {summary && (
              <p className="text-[11px] text-stone-500 mt-1 inline-flex items-center gap-1">
                <CalendarClock className="w-3 h-3" aria-hidden />
                {summary}
              </p>
            )}
            </div>
          );
        })}
        <form
          className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center pt-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run("/api/host/menu/categories", "POST", draft)) setDraft(empty);
          }}
        >
          {LANGS.map(({ key, dir, lang }) => (
            <input
              key={key}
              required
              maxLength={40}
              dir={dir}
              lang={lang}
              value={draft[`name${key}`]}
              placeholder={key === "En" ? t.nameEn : key === "Ar" ? t.nameAr : t.nameUr}
              onChange={(e) => setDraft({ ...draft, [`name${key}`]: e.target.value })}
              className={input}
            />
          ))}
          <button type="submit" className="px-3 py-2.5 rounded-xl bg-ink hover:bg-stone-800 text-white text-xs font-bold inline-flex items-center gap-1">
            <Plus className="w-4 h-4" aria-hidden />
            <span className="hidden sm:inline">{t.addCategory}</span>
          </button>
        </form>
      </div>
      {scheduling && (
        <CategoryScheduleModal
          t={t}
          locale={locale}
          category={scheduling}
          meal={meal}
          onClose={() => setScheduling(null)}
          onSave={async (days, periods) => {
            const c = scheduling;
            setScheduling(null);
            await run(`/api/host/menu/categories/${c.id}`, "PUT", { nameEn: c.nameEn, nameAr: c.nameAr, nameUr: c.nameUr, days, periods });
          }}
        />
      )}
    </section>
  );
}

function CategoryScheduleModal({
  t,
  locale,
  category,
  meal,
  onClose,
  onSave,
}: {
  t: Dict;
  locale: Locale;
  category: MenuCategory;
  meal: MealPeriod[];
  onClose: () => void;
  onSave: (days: number, periods: string[]) => void;
}) {
  const [days, setDays] = useState(category.days);
  const [periods, setPeriods] = useState(category.periods);
  return (
    <Modal title={`${t.categorySchedule}: ${tr(category, "name", locale)}`} onClose={onClose} closeLabel={t.close}>
      <div className="space-y-4">
        <SchedulePicker
          t={t}
          locale={locale}
          days={days}
          periods={periods}
          meal={meal}
          onChange={(d, p) => {
            setDays(d);
            setPeriods(p);
          }}
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100">
            {t.cancel}
          </button>
          <button type="button" onClick={() => onSave(days, periods)} className="px-5 py-2.5 rounded-xl bg-ember hover:bg-ember-dark text-white text-xs font-extrabold shadow">
            {t.save}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const timeLabel = (ms: number, l: Locale) =>
  new Intl.DateTimeFormat(l === "en" ? "en-GB" : l, { weekday: "short", hour: "2-digit", minute: "2-digit", numberingSystem: "latn" }).format(new Date(ms));

interface Draft {
  nameEn: string;
  nameAr: string;
  nameUr: string;
  descEn: string;
  descAr: string;
  descUr: string;
  price: string;
  compareAtPrice: string;
  isDeal: boolean;
  days: number;
  periods: string[];
  station: string;
  allergens: Allergen[];
  spiceLevels: SpiceLevel[];
  portions: { id: string; en: string; ar: string; ur: string; price: string }[];
  upsellItemId: string;
  categoryId: string;
  imagePath: string | null;
  imageUrl: string | null;
}

function ItemModal({
  t,
  locale,
  item,
  categories,
  meal,
  stations,
  allItems,
  currency,
  onClose,
  onSaved,
}: {
  t: Dict;
  locale: Locale;
  item: MenuItem | null;
  categories: MenuCategory[];
  meal: MealPeriod[];
  stations: Station[];
  allItems: MenuItem[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [d, setD] = useState<Draft>(() => ({
    nameEn: item?.nameEn ?? "",
    nameAr: item?.nameAr ?? "",
    nameUr: item?.nameUr ?? "",
    descEn: item?.descEn ?? "",
    descAr: item?.descAr ?? "",
    descUr: item?.descUr ?? "",
    price: item ? String(item.price) : "",
    compareAtPrice: item?.compareAtPrice ? String(item.compareAtPrice) : "",
    isDeal: item?.isDeal ?? false,
    days: item?.days ?? 127,
    periods: item?.periods ?? [],
    station: item?.station ?? "",
    allergens: item?.allergens ?? [],
    spiceLevels: item?.spiceLevels ?? [],
    portions: (item?.portions ?? []).map((p) => ({ ...p, price: String(p.price) })),
    upsellItemId: item?.upsellItemId ?? "",
    categoryId: item?.categoryId ?? "",
    imagePath: item?.imagePath ?? null,
    imageUrl: item?.imageUrl ?? null,
  }));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const up = await uploadImage(file, "item");
      setD((p) => ({ ...p, imagePath: up.path, imageUrl: up.url }));
    } catch (e) {
      setError(uploadErrorText(t, (e as Error).message));
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      ...d,
      price: Number(d.price),
      compareAtPrice: d.compareAtPrice.trim() ? Number(d.compareAtPrice) : null,
      categoryId: d.categoryId || null,
      portions: d.portions.map((p) => ({ ...p, price: Number(p.price) })),
      upsellItemId: d.upsellItemId || null,
    };
    const r = await send(item ? `/api/host/menu/items/${item.id}` : "/api/host/menu/items", item ? "PUT" : "POST", body);
    setBusy(false);
    if (r.ok) onSaved();
    else setError(errorText(t, r.error));
  }

  const label = (key: "En" | "Ar" | "Ur") => (key === "En" ? t.nameEn : key === "Ar" ? t.nameAr : t.nameUr);

  return (
    <Modal title={item ? t.editItem : t.newItem} onClose={onClose} closeLabel={t.close} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-2xl border border-line bg-cream overflow-hidden flex items-center justify-center shrink-0">
            {d.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.imageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Utensils className="w-8 h-8 text-stone-400" aria-hidden />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              className="px-3 py-2 rounded-xl bg-ink hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <ImagePlus className="w-4 h-4" aria-hidden />
              {uploading ? t.uploading : t.addPhoto}
            </button>
            {d.imageUrl && (
              <button
                type="button"
                onClick={() => setD((p) => ({ ...p, imagePath: null, imageUrl: null }))}
                className="px-3 py-2 rounded-xl text-xs font-bold text-stone-600 hover:text-red-700 hover:bg-red-50"
              >
                {t.removePhoto}
              </button>
            )}
          </div>
        </div>

        <fieldset>
          <legend className="text-xs font-bold text-stone-700 mb-1">{t.itemName}</legend>
          <div className="grid sm:grid-cols-3 gap-2">
            {LANGS.map(({ key, dir, lang }) => (
              <label key={key} className="block">
                <span className="block text-[11px] text-stone-500 mb-0.5">{label(key)}</span>
                <input required maxLength={80} dir={dir} lang={lang} value={d[`name${key}`]} onChange={(e) => set(`name${key}`, e.target.value)} className={input} />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-bold text-stone-700 mb-1">{t.itemDesc}</legend>
          <div className="grid sm:grid-cols-3 gap-2">
            {LANGS.map(({ key, dir, lang }) => (
              <label key={key} className="block">
                <span className="block text-[11px] text-stone-500 mb-0.5">{label(key)}</span>
                <textarea
                  required
                  maxLength={300}
                  rows={3}
                  dir={dir}
                  lang={lang}
                  value={d[`desc${key}`]}
                  onChange={(e) => set(`desc${key}`, e.target.value)}
                  className={`${input} resize-none`}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-xs font-bold text-stone-700 mb-1">
              {t.price} ({currency})
            </span>
            <input required type="number" min={0} step="0.01" inputMode="decimal" dir="ltr" value={d.price} onChange={(e) => set("price", e.target.value)} className={input} />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-stone-700 mb-1">{t.compareAtPrice}</span>
            <input type="number" min={0} step="0.01" inputMode="decimal" dir="ltr" value={d.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} className={input} />
            <span className="block text-[11px] text-stone-500 mt-1">{t.compareHelp}</span>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-stone-700 mb-1">{t.category}</span>
            <select value={d.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={`${input} font-bold`}>
              <option value="">{t.noCategory}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {tr(c, "name", locale)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3">
          <label className="flex items-start gap-2 p-3 rounded-xl border border-line cursor-pointer">
            <input type="checkbox" checked={d.isDeal} onChange={(e) => set("isDeal", e.target.checked)} className="mt-0.5 accent-ember" />
            <span>
              <span className="block text-sm font-bold">{t.isDeal}</span>
              <span className="block text-[11px] text-stone-500">{t.dealHelp}</span>
            </span>
          </label>
        </div>

        <fieldset className="p-3 rounded-xl border border-line space-y-3">
          <legend className="px-1 text-xs font-bold text-stone-700">{t.optionsTitle}</legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-bold text-stone-500 mb-1">{t.stationLbl}</span>
              <select value={d.station} onChange={(e) => set("station", e.target.value)} className={input}>
                <option value="">{t.noStation}</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s[locale] || s.en}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-bold text-stone-500 mb-1">{t.upsellPick}</span>
              <select value={d.upsellItemId} onChange={(e) => set("upsellItemId", e.target.value)} className={input}>
                <option value="">{t.noneOpt}</option>
                {allItems
                  .filter((x) => x.id !== item?.id && x.portions.length === 0)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {tr(x, "name", locale)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div>
            <p className="text-[11px] font-bold text-stone-500 mb-1.5">{t.allergensLbl}</p>
            <div className="flex flex-wrap gap-1.5">
              {ALLERGENS.map((a) => {
                const on = d.allergens.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("allergens", on ? d.allergens.filter((x) => x !== a) : [...d.allergens, a])}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${on ? "bg-amber-500 text-ink border-amber-500" : "bg-white text-stone-600 border-line"}`}
                  >
                    {(t as unknown as Record<string, string>)[`alg_${a}`]}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-stone-500 mb-1.5">{t.spiceLbl}</p>
            <div className="flex flex-wrap gap-1.5">
              {SPICE_LEVELS.map((l) => {
                const on = d.spiceLevels.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("spiceLevels", on ? d.spiceLevels.filter((x) => x !== l) : SPICE_LEVELS.filter((x) => x === l || d.spiceLevels.includes(x)))}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${on ? "bg-red-600 text-white border-red-600" : "bg-white text-stone-600 border-line"}`}
                  >
                    {(t as unknown as Record<string, string>)[`spice_${l}`]}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-stone-500">{t.portionsLbl}</p>
            <p className="text-[11px] text-stone-500 mb-1.5">{t.portionsHelp}</p>
            <div className="space-y-2">
              {d.portions.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_6rem_auto] gap-1.5 items-center">
                  {(["en", "ar", "ur"] as const).map((k) => (
                    <input
                      key={k}
                      aria-label={`${t.portionLbl} ${k}`}
                      value={p[k]}
                      maxLength={20}
                      dir={k === "en" ? "ltr" : "rtl"}
                      onChange={(e) => set("portions", d.portions.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                      className={input}
                    />
                  ))}
                  <input
                    aria-label={t.price}
                    type="number"
                    min={0}
                    step="0.01"
                    dir="ltr"
                    value={p.price}
                    onChange={(e) => set("portions", d.portions.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                    className={input}
                  />
                  <button type="button" aria-label={t.delete} onClick={() => set("portions", d.portions.filter((_, j) => j !== i))} className="p-2 rounded-lg text-stone-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              {d.portions.length === 0 && (
                <button
                  type="button"
                  onClick={() =>
                    set("portions", [
                      { id: "half", en: "Half", ar: "نصف", ur: "ہاف", price: d.price ? String(Math.round(Number(d.price) * 0.6)) : "" },
                      { id: "full", en: "Full", ar: "كامل", ur: "فل", price: d.price },
                    ])
                  }
                  className="px-3 py-1.5 rounded-lg bg-ink text-white text-xs font-bold"
                >
                  {t.presetHalfFull}
                </button>
              )}
              {d.portions.length < 4 && (
                <button
                  type="button"
                  onClick={() => set("portions", [...d.portions, { id: `size-${d.portions.length + 1}-${Date.now() % 1000}`, en: "", ar: "", ur: "", price: "" }])}
                  className="px-3 py-1.5 rounded-lg bg-white border border-line text-xs font-bold"
                >
                  {t.addPortion}
                </button>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="p-3 rounded-xl border border-line">
          <legend className="px-1 text-xs font-bold text-stone-700">{t.scheduleTitle}</legend>
          <SchedulePicker
            t={t}
            locale={locale}
            days={d.days}
            periods={d.periods}
            meal={meal}
            onChange={(days, periods) => setD((p) => ({ ...p, days, periods }))}
          />
        </fieldset>

        {error && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100">
            {t.cancel}
          </button>
          <button type="submit" disabled={busy || uploading} className="px-5 py-2.5 rounded-xl bg-ember hover:bg-ember-dark disabled:opacity-60 text-white text-xs font-extrabold shadow">
            {busy ? t.saving : t.save}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Thumb({ url, size = "w-14 h-14" }: { url: string | null; size?: string }) {
  return (
    <div className={`${size} rounded-xl bg-cream border border-line overflow-hidden flex items-center justify-center shrink-0`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <Utensils className="w-5 h-5 text-stone-400" aria-hidden />
      )}
    </div>
  );
}

export function DealBadge({ label }: { label: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-gold/20 text-amber-900 border border-gold/50 inline-flex items-center gap-0.5">
      <Tag className="w-3 h-3" aria-hidden />
      {label}
    </span>
  );
}

export function Price({ item, currency }: { item: Pick<MenuItem, "price" | "compareAtPrice">; currency: string }) {
  return (
    <span className="text-xs mt-0.5 inline-flex items-center gap-2">
      <span className="font-extrabold text-ember ltr">{money(item.price, currency)}</span>
      {item.compareAtPrice && <span className="text-stone-400 line-through ltr">{money(item.compareAtPrice, currency)}</span>}
    </span>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`p-2 rounded-lg text-stone-500 ${danger ? "hover:text-red-700 hover:bg-red-50" : "hover:text-ink hover:bg-stone-100"}`}
    >
      {children}
    </button>
  );
}
