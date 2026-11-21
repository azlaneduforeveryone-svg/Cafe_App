"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="p-2 rounded-lg bg-ink-2 hover:bg-stone-700 text-stone-300 transition-colors"
    >
      <LogOut className="w-4 h-4" aria-hidden />
    </button>
  );
}
