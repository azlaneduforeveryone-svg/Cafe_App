"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Modal({ title, onClose, closeLabel, children, tone = "default" }: { title: string; onClose: () => void; closeLabel: string; children: React.ReactNode; tone?: "default" | "gold" }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  // Runs once on open: Escape closes, focus moves into the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, select")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 ${tone === "gold" ? "border-2 border-gold" : "border border-line"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-extrabold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
