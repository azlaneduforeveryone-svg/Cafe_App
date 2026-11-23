"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Minus, Plus, ShoppingBag, Tag, Utensils } from "lucide-react";
import { money } from "@/lib/pricing";
import { fmt, tr } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import type { Locale, Menu, MenuItem, Order } from "@/lib/types";

type Cart = Record<string, number>;

/**
 * Full-screen menu over the ticket. Guests add dishes, review and send:
 *   mode "pre":   a pre-order while waiting (view-only once the restaurant accepts it)
 *   mode "table": an order from the table after being seated; `order` is the round still
 *                 waiting for the restaurant, if any (sending again updates it)
 * Sold-out dishes are shown but can't be added.
 */
export function MenuSheet({
  t,
  locale,
  token,
  order,
  mode = "pre",
  onClose,
  onSent,
}: {
  t: Dict;
  locale: Locale;
  token: string;
  order: Order | null;
  mode?: "pre" | "table";
  onClose: () => void;
  onSent: () => void;
}) {
  const readOnly = mode === "pre" && order?.status === "accepted";
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [cart, setCart] = useState<Cart>(() =>
    order && order.status === "submitted" ? Object.fromEntries(order.items.map((l) => [l.id, l.qty])) : {},
  );
  const [note, setNote] = useState(order?.status === "submitted" ? order.note : "");
  const [step, setStep] = useState<"menu" | "review">("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`/api/ticket/${encodeURIComponent(token)}/menu`, { cache: "no-store" }).catch(() => null);
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
    fetch(`/api/ticket/${encodeURIComponent(token)}/menu`, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return setLoadError(true);
        setMenu((await res.json()) as Menu);
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Close with Escape, like other dialogs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const byId = useMemo(() => new Map((menu?.items ?? []).map((i) => [i.id, i])), [menu]);
  const lines = Object.entries(cart)
    .filter(([id, q]) => q > 0 && byId.has(id) && byId.get(id)!.inStock)
    .map(([id, qty]) => ({ item: byId.get(id)!, qty }));
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * l.item.price, 0);
  const currency = menu?.currency ?? "";

  const setQty = (id: string, qty: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, qty)) }));

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/ticket/${encodeURIComponent(token)}/${mode === "table" ? "table-order" : "order"}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: lines.map((l) => ({ id: l.item.id, qty: l.qty })), note }),
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

  const deals = (menu?.items ?? []).filter((i) => i.isDeal);
  const groups = menu
    ? [
        ...menu.categories.map((c) => ({ key: c.id, title: tr(c, "name", locale), items: menu.items.filter((i) => !i.isDeal && i.categoryId === c.id) })),
        {
          key: "other",
          title: t.noCategory,
          items: menu.items.filter((i) => !i.isDeal && (!i.categoryId || !menu.categories.some((c) => c.id === i.categoryId))),
        },
      ].filter((g) => g.items.length)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40" role="dialog" aria-modal="true" aria-label={t.viewMenu}>
      <div className="w-full sm:max-w-[420px] h-full bg-cream text-ink flex flex-col">
        <header className="px-4 py-3 bg-white border-b border-line flex items-center gap-3">
          <button
            type="button"
            onClick={() => (step === "review" ? setStep("menu") : onClose())}
            aria-label={t.backToTicket}
            className="p-2 rounded-lg hover:bg-stone-100"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" aria-hidden />
          </button>
          <h2 className="font-extrabold text-base">{step === "review" ? t.yourOrder : t.menuNav}</h2>
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

          {menu && step === "menu" && (
            <>
              {deals.length > 0 && (
                <Section title={t.dealsTitle} icon>
                  {deals.map((i) => (
                    <ItemCard key={i.id} t={t} locale={locale} item={i} currency={currency} qty={cart[i.id] ?? 0} readOnly={readOnly} onQty={(q) => setQty(i.id, q)} />
                  ))}
                </Section>
              )}
              {groups.map((g) => (
                <Section key={g.key} title={g.title}>
                  {g.items.map((i) => (
                    <ItemCard key={i.id} t={t} locale={locale} item={i} currency={currency} qty={cart[i.id] ?? 0} readOnly={readOnly} onQty={(q) => setQty(i.id, q)} />
                  ))}
                </Section>
              ))}
            </>
          )}

          {menu && step === "review" && (
            <div className="space-y-4">
              <ul className="bg-white rounded-2xl border border-line divide-y divide-line">
                {lines.map(({ item, qty }) => (
                  <li key={item.id} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{tr(item, "name", locale)}</p>
                      <p className="text-xs text-stone-500 ltr">{money(item.price * qty, currency)}</p>
                    </div>
                    <Stepper qty={qty} onQty={(q) => setQty(item.id, q)} t={t} />
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
                ·{" "}
                <span className="ltr">{money(total, currency)}</span>
              </span>
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500 mb-2 flex items-center gap-1">
        {icon && <Tag className="w-3.5 h-3.5 text-gold" aria-hidden />}
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ItemCard({
  t,
  locale,
  item,
  currency,
  qty,
  readOnly,
  onQty,
}: {
  t: Dict;
  locale: Locale;
  item: MenuItem;
  currency: string;
  qty: number;
  readOnly: boolean;
  onQty: (q: number) => void;
}) {
  return (
    <article className={`bg-white rounded-2xl border overflow-hidden ${item.isDeal ? "border-gold" : "border-line"} ${item.inStock ? "" : "opacity-60"}`}>
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" loading="lazy" className="w-full h-40 object-cover bg-cream" />
      ) : null}
      <div className="p-3.5 flex gap-3">
        {!item.imageUrl && (
          <span className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center shrink-0">
            <Utensils className="w-4 h-4 text-stone-400" aria-hidden />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-extrabold text-sm">{tr(item, "name", locale)}</h4>
            {item.isDeal && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-gold/20 text-amber-900 border border-gold/50">{t.dealBadge}</span>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-0.5">{tr(item, "desc", locale)}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-sm inline-flex items-center gap-2">
              <span className="font-extrabold text-ember ltr">{money(item.price, currency)}</span>
              {item.compareAtPrice && <span className="text-xs text-stone-400 line-through ltr">{money(item.compareAtPrice, currency)}</span>}
            </span>
            {!item.inStock ? (
              <span className="px-2 py-1 rounded-lg text-[11px] font-extrabold bg-red-100 text-red-800">{t.soldOut}</span>
            ) : !readOnly &&
              (qty > 0 ? (
                <Stepper qty={qty} onQty={onQty} t={t} />
              ) : (
                <button type="button" onClick={() => onQty(1)} className="px-3 py-1.5 rounded-xl bg-ink text-white text-xs font-bold inline-flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" aria-hidden />
                  {t.add}
                </button>
              ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function Stepper({ qty, onQty, t }: { qty: number; onQty: (q: number) => void; t: Dict }) {
  return (
    <div className="flex items-center gap-1 bg-cream rounded-xl border border-line" dir="ltr">
      <button type="button" aria-label={`${t.remove} 1`} onClick={() => onQty(qty - 1)} className="p-1.5 rounded-lg hover:bg-white">
        <Minus className="w-4 h-4" aria-hidden />
      </button>
      <span className="w-6 text-center text-sm font-extrabold" aria-live="polite">
        {qty}
      </span>
      <button type="button" aria-label={`${t.add} 1`} disabled={qty >= 20} onClick={() => onQty(qty + 1)} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-40">
        <Plus className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}
