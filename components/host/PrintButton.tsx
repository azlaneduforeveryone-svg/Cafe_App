"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="px-4 py-2.5 rounded-xl bg-ink hover:bg-stone-800 text-white text-xs font-bold inline-flex items-center gap-1.5">
      <Printer className="w-4 h-4" aria-hidden />
      {label}
    </button>
  );
}
