"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-ink text-cream hover:bg-ink-2">
      <Printer className="w-3.5 h-3.5" aria-hidden /> {label}
    </button>
  );
}
