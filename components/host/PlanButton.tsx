"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Test-mode plan switch. The real version will redirect to the payment gateway. */
export function PlanButton({ label, plan, subtle }: { label: string; plan: "free" | "pro"; subtle?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/host/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
        router.refresh();
        setBusy(false);
      }}
      className={
        subtle
          ? "w-full py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white disabled:opacity-60"
          : "w-full py-3 rounded-xl bg-ember hover:bg-ember-dark text-white text-sm font-bold disabled:opacity-60"
      }
    >
      {label}
    </button>
  );
}
