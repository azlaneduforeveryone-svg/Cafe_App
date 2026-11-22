"use client";

import { useCallback, useRef, useState } from "react";
import { Eye, EyeOff, ImagePlus, Pencil, Plus, Tag, Trash2, Utensils } from "lucide-react";
import { Modal } from "@/components/Modal";
import { uploadErrorText } from "./LogoCard";
import { uploadImage } from "@/lib/image";
import { money } from "@/lib/pricing";
import { tr } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { Locale, Menu, MenuCategory, MenuItem } from "@/lib/types";

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
      <Categories t={t} categories={menu.categories} run={run} />

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
                    <li key={item.id} className={`p-3 rounded-2xl border flex items-center gap-3 ${item.available ? "border-line bg-white" : "border-dashed border-stone-300 bg-stone-50"}`}>
                      <Thumb url={item.imageUrl} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-extrabold text-sm truncate">{tr(item, "name", locale)}</span>
                          {item.isDeal && <DealBadge label={t.dealBadge} />}
                          {!item.available && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-stone-200 text-stone-600">{t.hiddenBadge}</span>}
                        </div>
                        <Price item={item} currency={menu.currency} />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <IconButton
                          label={item.available ? t.hide : t.show}
                          onClick={() => run(`/api/host/menu/items/${item.id}`, "PUT", { available: !item.available })}
                        >
                          {item.available ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </IconButton>
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

function Categories({ t, categories, run }: { t: Dict; categories: MenuCategory[]; run: (url: string, method: string, body?: unknown) => Promise<boolean> }) {
  const empty = { nameEn: "", nameAr: "", nameUr: "" };
  const [draft, setDraft] = useState(empty);
  const [edits, setEdits] = useState<Record<string, typeof empty>>({});

  return (
    <section className="bg-white rounded-3xl border border-line shadow-sm p-5">
      <h2 className="font-extrabold text-sm">{t.categoriesTitle}</h2>
      <p className="text-xs text-stone-500 mt-0.5 mb-3">{t.categoriesHelp}</p>
      <div className="space-y-2">
        {categories.map((c) => {
          const v = edits[c.id] ?? { nameEn: c.nameEn, nameAr: c.nameAr, nameUr: c.nameUr };
          const changed = v.nameEn !== c.nameEn || v.nameAr !== c.nameAr || v.nameUr !== c.nameUr;
          return (
            <div key={c.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
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
                      if (await run(`/api/host/menu/categories/${c.id}`, "PUT", v)) {
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
                <IconButton label={t.delete} danger onClick={() => run(`/api/host/menu/categories/${c.id}`, "DELETE")}>
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
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
    </section>
  );
}

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
  available: boolean;
  categoryId: string;
  imagePath: string | null;
  imageUrl: string | null;
}

function ItemModal({
  t,
  locale,
  item,
  categories,
  currency,
  onClose,
  onSaved,
}: {
  t: Dict;
  locale: Locale;
  item: MenuItem | null;
  categories: MenuCategory[];
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
    available: item?.available ?? true,
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

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex items-start gap-2 p-3 rounded-xl border border-line cursor-pointer">
            <input type="checkbox" checked={d.isDeal} onChange={(e) => set("isDeal", e.target.checked)} className="mt-0.5 accent-ember" />
            <span>
              <span className="block text-sm font-bold">{t.isDeal}</span>
              <span className="block text-[11px] text-stone-500">{t.dealHelp}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 p-3 rounded-xl border border-line cursor-pointer">
            <input type="checkbox" checked={d.available} onChange={(e) => set("available", e.target.checked)} className="mt-0.5 accent-ember" />
            <span className="block text-sm font-bold">{t.availableLabel}</span>
          </label>
        </div>

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
