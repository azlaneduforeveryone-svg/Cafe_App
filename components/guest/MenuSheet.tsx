"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Flame, Minus, Plus, Search, ShoppingBag, Tag, Utensils, X } from "lucide-react";
import { money } from "@/lib/pricing";
import { fmt, tr } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { Locale, Menu, MenuItem, Order, SpiceLevel } from "@/lib/types";

/** One cart line: the same dish with different size or spice is a separate line. */
interface Line {
  id: string;
  qty: number;
  portion?: string;
  spice?: SpiceLevel;
}
type Cart = Record<string, Line>;
const keyOf = (l: Omit<Line, "qty">) => `${l.id}|${l.portion ?? ""}|${l.spice ?? ""}`;
const unitPrice = (item: MenuItem, portion?: string) => item.portions.find((p) => p.id === portion)?.price ?? item.price;

/**
 * Full-screen menu over the ticket or table page. Search, category tabs, and a drawer per dish
 * with allergens, size, spice level and combo offer. Then review and send:
 *   mode "pre":   a pre-order while waiting (view-only once the restaurant accepts it)
 *   mode "table": an order from the table; `order` is the round still waiting for the restaurant
 * Sold-out dishes are shown but can't be added. Prices on the server always come from the menu.
 */
export function MenuSheet({
  t,
  locale,
  token,
  order,
  mode = "pre",
  endpoints,
  onClose,
  onSent,
}: {
  t: Dict;
  locale: Locale;
  token: string;
  order: Order | null;
  mode?: "pre" | "table";
  /** Defaults to the waitlist ticket's endpoints. */
  endpoints?: { menu: string; order: string };
  onClose: () => void;
  onSent: () => void;
}) {
  const readOnly = mode === "pre" && order?.status === "accepted";
  const menuUrl = endpoints?.menu ?? `/api/ticket/${encodeURIComponent(token)}/menu`;
  const orderUrl = endpoints?.order ?? `/api/ticket/${encodeURIComponent(token)}/${mode === "table" ? "table-order" : "order"}`;
  const d = t as unknown as Record<string, string>;

  const [menu, setMenu] = useState<Menu | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [cart, setCart] = useState<Cart>(() => {
    const c: Cart = {};
    if (order && order.status === "submitted") {
      for (const l of order.items) {
        const line: Line = { id: l.id, qty: l.qty, ...(l.portion ? { portion: l.portion.id } : {}), ...(l.spice ? { spice: l.spice } : {}) };
        c[keyOf(line)] = line;
      }
    }
    return c;
  });
  const [note, setNote] = useState(order?.status === "submitted" ? order.note : "");
  const [step, setStep] = useState<"menu" | "review">("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string>("all");
  const [open, setOpen] = useState<MenuItem | null>(null);

  const load = async () => {
    const res = await fetch(menuUrl, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setLoadError(true);
      return null;
    }
    const m = (await res.json()) as Menu;
    setMenu(m);
    return m;
  };

  useEffect(() => {
    let cancelled = false;
    fetch(menuUrl, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return setLoadError(true);
        setMenu((await res.json()) as Menu);
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [menuUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (open) setOpen(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const byId = useMemo(() => new Map((menu?.items ?? []).map((i) => [i.id, i])), [menu]);
  const lines = Object.entries(cart)
    .filter(([, l]) => l.qty > 0 && byId.has(l.id) && byId.get(l.id)!.inStock)
    .map(([key, l]) => ({ key, line: l, item: byId.get(l.id)! }));
  const count = lines.reduce((n, l) => n + l.line.qty, 0);
  const total = lines.reduce((s, l) => s + l.line.qty * unitPrice(l.item, l.line.portion), 0);
  const currency = menu?.currency ?? "";
  const qtyOfItem = (id: string) => lines.filter((l) => l.line.id === id).reduce((n, l) => n + l.line.qty, 0);

  const add = (l: Line) =>
    setCart((c) => {
      const k = keyOf(l);
      const cur = c[k]?.qty ?? 0;
      return { ...c, [k]: { ...l, qty: Math.min(20, cur + l.qty) } };
    });
  const setQty = (key: string, qty: number) => setCart((c) => ({ ...c, [key]: { ...c[key], qty: Math.max(0, Math.min(20, qty)) } }));

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(orderUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: lines.map((l) => ({ id: l.line.id, qty: l.line.qty, portion: l.line.portion, spice: l.line.spice })), note }),
    }).catch(() => null);
    const out = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : { error: "network" };
    setBusy(false);
    if (res?.ok) {
      onSent();
      onClose();
      return;
    }
    if (out.error === "item_unavailable") {
      setError(t.itemUnavailable);
      await load();
      setStep("menu");
    } else if (out.error === "order_locked") setError(t.orderLocked);
    else if (out.error === "table_closed") setError(t.tableClosedBody);
    else setError(t.errorGeneric);
  }

  // Search and tabs
  const q = query.trim().toLowerCase();
  const matches = (i: MenuItem) => !q || [i.nameEn, i.nameAr, i.nameUr, i.descEn, i.descAr, i.descUr].some((s) => s.toLowerCase().includes(q));
  const items = (menu?.items ?? []).filter(matches);
  const deals = items.filter((i) => i.isDeal);
  const cats = menu?.categories.filter((c) => items.some((i) => !i.isDeal && i.categoryId === c.id)) ?? [];
  const groups = menu
    ? [
        ...(deals.length ? [{ key: "deals", title: t.dealsTitle, items: deals, icon: true }] : []),
        ...cats.map((c) => ({ key: c.id, title: tr(c, "name", locale), items: items.filter((i) => !i.isDeal && i.categoryId === c.id), icon: false })),
        {
          key: "other",
          title: t.noCategory,
          items: items.filter((i) => !i.isDeal && (!i.categoryId || !menu.categories.some((c) => c.id === i.categoryId))),
          icon: false,
        },
      ].filter((g) => g.items.length && (tab === "all" || g.key === tab))
    : [];
  const tabs = [{ key: "all", title: t.allCats }, ...(deals.length ? [{ key: "deals", title: t.dealsTitle }] : []), ...cats.map((c) => ({ key: c.id, title: tr(c, "name", locale) }))];

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40" role="dialog" aria-modal="true" aria-label={t.viewMenu}>
      <div className="w-full sm:max-w-[420px] h-full bg-cream text-ink flex flex-col relative">
        <header className="px-4 pt-3 pb-2 bg-white border-b border-line space-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (step === "review" ? setStep("menu") : onClose())}
              aria-label={t.backToTicket}
              className="p-2 rounded-lg hover:bg-stone-100"
            >
              <ArrowLeft className="w-5 h-5 rtl:rotate-180" aria-hidden />
            </button>
            <h2 className="font-extrabold text-base">{step === "review" ? t.yourOrder : t.menuNav}</h2>
          </div>
          {step === "menu" && menu && (
            <>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cream border border-line">
                <Search className="w-4 h-4 text-stone-400 shrink-0" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.searchMenu}
                  aria-label={t.searchMenu}
                  className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                />
              </label>
              {tabs.length > 2 && (
                <nav className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" aria-label={t.categoriesTitle}>
                  {tabs.map((tb) => (
                    <button
                      key={tb.key}
                      type="button"
                      aria-pressed={tab === tb.key}
                      onClick={() => setTab(tb.key)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border ${tab === tb.key ? "bg-ink text-white border-ink" : "bg-white text-stone-600 border-line"}`}
                    >
                      {tb.title}
                    </button>
                  ))}
                </nav>
              )}
            </>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {error && (
            <p role="alert" className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
          {!menu && !loadError && <p className="py-16 text-center text-sm text-stone-500">{t.loadingMenu}</p>}
          {loadError && <p className="py-16 text-center text-sm text-stone-500">{t.errorGeneric}</p>}
          {menu && menu.items.length === 0 && <p className="py-16 text-center text-sm text-stone-500">{t.menuEmpty}</p>}

          {menu && step === "menu" &&
            groups.map((g) => (
              <section key={g.key}>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 mb-2 flex items-center gap-1">
                  {g.icon && <Tag className="w-3.5 h-3.5 text-gold" aria-hidden />}
                  {g.title}
                </h3>
                <div className="space-y-3">
                  {g.items.map((i) => (
                    <ItemCard key={i.id} t={t} locale={locale} item={i} currency={currency} qty={qtyOfItem(i.id)} readOnly={readOnly} onOpen={() => setOpen(i)} />
                  ))}
                </div>
              </section>
            ))}

          {menu && step === "review" && (
            <div className="space-y-4">
              <ul className="bg-white rounded-2xl border border-line divide-y divide-line">
                {lines.map(({ key, line, item }) => (
                  <li key={key} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{tr(item, "name", locale)}</p>
                      <p className="text-[11px] text-stone-500">
                        {[item.portions.find((p) => p.id === line.portion)?.[locale], line.spice ? d[`spice_${line.spice}`] : ""].filter(Boolean).join(" · ")}
                      </p>
                      <p className="text-xs text-stone-500 ltr text-start">{money(unitPrice(item, line.portion) * line.qty, currency)}</p>
                    </div>
                    <Stepper qty={line.qty} onQty={(n) => setQty(key, n)} t={t} />
                  </li>
                ))}
              </ul>
              <label className="block">
                <span className="sr-only">{t.orderNoteLabel}</span>
                <textarea
                  value={note}
                  maxLength={200}
                  rows={2}
                  placeholder={t.orderNotePh}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-line text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ember"
                />
              </label>
              <p className="text-xs text-stone-500">{mode === "table" ? t.tableOrderInfo : t.preOrderInfo}</p>
            </div>
          )}
        </div>

        {menu && !readOnly && count > 0 && (
          <footer className="p-3 bg-white border-t border-line">
            <button
              type="button"
              disabled={busy}
              onClick={() => (step === "menu" ? setStep("review") : submit())}
              className="w-full py-3.5 px-4 rounded-2xl bg-ember hover:bg-ember-dark disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" aria-hidden />
                {fmt(t.itemsCount, { n: count })}
              </span>
              <span>
                {step === "menu"
                  ? t.reviewOrder
                  : mode === "table"
                    ? order?.status === "submitted"
                      ? t.updateTableOrder
                      : t.sendTableOrder
                    : order?.status === "submitted"
                      ? t.updatePreOrder
                      : t.sendPreOrder}{" "}
                · <span className="ltr">{money(total, currency)}</span>
              </span>
            </button>
          </footer>
        )}

        {open && menu && (
          <ItemDrawer
            t={t}
            locale={locale}
            item={open}
            upsell={open.upsellItemId ? (byId.get(open.upsellItemId) ?? null) : null}
            currency={currency}
            readOnly={readOnly}
            onClose={() => setOpen(null)}
            onAdd={(lines) => {
              lines.forEach(add);
              setOpen(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function ItemCard({
  t,
  locale,
  item,
  currency,
  qty,
  readOnly,
  onOpen,
}: {
  t: Dict;
  locale: Locale;
  item: MenuItem;
  currency: string;
  qty: number;
  readOnly: boolean;
  onOpen: () => void;
}) {
  const from = item.portions.length ? Math.min(...item.portions.map((p) => p.price)) : item.price;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!item.inStock && !readOnly}
      className={`w-full text-start bg-white rounded-2xl border overflow-hidden flex ${item.isDeal ? "border-gold" : "border-line"} ${item.inStock ? "hover:border-stone-400" : "opacity-60"}`}
    >
      <div className="flex-1 min-w-0 p-3.5">
        <div className="flex items-start gap-2">
          <h4 className="font-extrabold text-sm flex-1">{tr(item, "name", locale)}</h4>
          {qty > 0 && <span className="shrink-0 min-w-6 h-6 px-1.5 rounded-full bg-ember text-white text-xs font-extrabold flex items-center justify-center ltr">{qty}</span>}
        </div>
        <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{tr(item, "desc", locale)}</p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="font-extrabold text-sm text-ember ltr">{money(from, currency)}</span>
          {item.compareAtPrice && <span className="text-xs text-stone-400 line-through ltr">{money(item.compareAtPrice, currency)}</span>}
          {item.spiceLevels.length > 0 && <Flame className="w-3.5 h-3.5 text-red-600" aria-hidden />}
          {!item.inStock && <span className="px-2 py-0.5 rounded-lg text-[11px] font-extrabold bg-red-100 text-red-800">{t.soldOut}</span>}
        </div>
      </div>
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" loading="lazy" className="w-28 h-auto min-h-28 object-cover bg-cream shrink-0" />
      ) : (
        <span className="w-16 flex items-center justify-center bg-cream shrink-0">
          <Utensils className="w-5 h-5 text-stone-400" aria-hidden />
        </span>
      )}
    </button>
  );
}

/** Slide-up drawer: photo, description, allergens, size, spice, combo offer, quantity. */
function ItemDrawer({
  t,
  locale,
  item,
  upsell,
  currency,
  readOnly,
  onClose,
  onAdd,
}: {
  t: Dict;
  locale: Locale;
  item: MenuItem;
  upsell: MenuItem | null;
  currency: string;
  readOnly: boolean;
  onClose: () => void;
  onAdd: (lines: Line[]) => void;
}) {
  const d = t as unknown as Record<string, string>;
  const [portion, setPortion] = useState<string | undefined>(item.portions[item.portions.length - 1]?.id);
  const [spice, setSpice] = useState<SpiceLevel | undefined>(item.spiceLevels.includes("medium") ? "medium" : item.spiceLevels[0]);
  const [qty, setQty] = useState(1);
  const offerUpsell = !!upsell && upsell.inStock && upsell.portions.length === 0;
  const [withUpsell, setWithUpsell] = useState(false);
  const price = unitPrice(item, portion) * qty + (withUpsell && upsell ? upsell.price * qty : 0);
  const chip = (on: boolean) => `px-3 py-2 rounded-xl text-sm font-bold border ${on ? "bg-ink text-white border-ink" : "bg-white text-stone-700 border-line"}`;

  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-t-3xl max-h-[88%] overflow-y-auto shadow-2xl animate-[slideUp_.2s_ease-out]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr(item, "name", locale)}>
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="w-full h-52 object-cover rounded-t-3xl" />
        )}
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-xl font-extrabold">{tr(item, "name", locale)}</h3>
            <button type="button" onClick={onClose} aria-label={t.close} className="p-1.5 rounded-lg hover:bg-stone-100 -mt-1">
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>
          <p className="text-sm text-stone-600 -mt-2">{tr(item, "desc", locale)}</p>

          {item.allergens.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-stone-500 mb-1.5">{t.allergensLbl}</p>
              <div className="flex flex-wrap gap-1.5">
                {item.allergens.map((a) => (
                  <span key={a} className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                    {d[`alg_${a}`]}
                  </span>
                ))}
              </div>
            </div>
          )}

          {item.portions.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-stone-500 mb-1.5">{t.portionLbl}</p>
              <div className="flex flex-wrap gap-2">
                {item.portions.map((p) => (
                  <button key={p.id} type="button" aria-pressed={portion === p.id} onClick={() => setPortion(p.id)} className={chip(portion === p.id)}>
                    {p[locale] || p.en} <span className="opacity-70 ltr">{money(p.price, currency)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.spiceLevels.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-stone-500 mb-1.5">{t.spiceLbl}</p>
              <div className="flex flex-wrap gap-2">
                {item.spiceLevels.map((s) => (
                  <button key={s} type="button" aria-pressed={spice === s} onClick={() => setSpice(s)} className={chip(spice === s)}>
                    <Flame className={`inline w-3.5 h-3.5 me-1 ${s === "hot" ? "text-red-500" : s === "medium" ? "text-orange-500" : "text-emerald-500"}`} aria-hidden />
                    {d[`spice_${s}`]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {offerUpsell && upsell && !readOnly && (
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gold bg-amber-50/60 cursor-pointer">
              <span>
                <span className="block text-sm font-extrabold">{t.upsellLbl}</span>
                <span className="block text-xs text-stone-600">
                  + {tr(upsell, "name", locale)} <span className="ltr">{money(upsell.price, currency)}</span>
                </span>
              </span>
              <input type="checkbox" checked={withUpsell} onChange={(e) => setWithUpsell(e.target.checked)} className="w-5 h-5 accent-ember" />
            </label>
          )}

          {!readOnly && item.inStock && (
            <div className="flex items-center gap-3 pt-1">
              <Stepper qty={qty} onQty={(n) => setQty(Math.max(1, n))} t={t} />
              <button
                type="button"
                onClick={() => onAdd([{ id: item.id, qty, ...(portion ? { portion } : {}), ...(spice ? { spice } : {}) }, ...(withUpsell && upsell ? [{ id: upsell.id, qty }] : [])])}
                className="flex-1 py-3.5 rounded-2xl bg-ember hover:bg-ember-dark text-white text-sm font-extrabold flex items-center justify-between px-4"
              >
                <span>{t.addToOrder}</span>
                <span className="ltr">{money(price, currency)}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ qty, onQty, t }: { qty: number; onQty: (q: number) => void; t: Dict }) {
  return (
    <div className="flex items-center gap-1 bg-cream rounded-xl border border-line" dir="ltr">
      <button type="button" aria-label={`${t.remove} 1`} onClick={() => onQty(qty - 1)} className="p-2 rounded-lg hover:bg-white">
        <Minus className="w-4 h-4" aria-hidden />
      </button>
      <span className="w-6 text-center text-sm font-extrabold" aria-live="polite">
        {qty}
      </span>
      <button type="button" aria-label={`${t.add} 1`} disabled={qty >= 20} onClick={() => onQty(qty + 1)} className="p-2 rounded-lg hover:bg-white disabled:opacity-40">
        <Plus className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}
