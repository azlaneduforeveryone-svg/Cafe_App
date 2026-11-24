"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MonitorSmartphone } from "lucide-react";
import { Modal } from "@/components/Modal";
import type { Dict } from "@/lib/i18n";

/** Manager: lock this browser to the kitchen screen (their own login is signed out here). */
export function KitchenDeviceButton({ t }: { t: Dict }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-stone-100 text-xs font-bold inline-flex items-center gap-1.5">
        <MonitorSmartphone className="w-4 h-4" aria-hidden />
        {t.kdTurnOn}
      </button>
      {open && (
        <Modal title={t.kdTurnOn} onClose={() => setOpen(false)} closeLabel={t.close}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(false);
              const res = await fetch("/api/host/kitchen-device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => null);
              if (res?.ok) {
                router.replace("/kitchen-display");
                router.refresh();
                return;
              }
              setBusy(false);
              setError(true);
            }}
          >
            <p className="text-sm text-stone-600">{t.kdTurnOnHelp}</p>
            <label className="block space-y-1.5">
              <span className="text-sm font-bold">{t.kdName}</span>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder={t.kdNamePlaceholder} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm" />
            </label>
            {error && <p role="alert" className="text-sm font-bold text-red-700">{t.errorGeneric}</p>}
            <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-ink text-white font-extrabold disabled:opacity-60">
              {t.kdTurnOnConfirm}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
