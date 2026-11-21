import Link from "next/link";
import { Bell } from "lucide-react";

export function Brand({ name, href = "/", dark = true }: { name: string; href?: string; dark?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-ember to-gold flex items-center justify-center shadow-md">
        <Bell className="w-5 h-5 text-white" aria-hidden />
      </span>
      <span className={`font-extrabold tracking-tight text-lg ${dark ? "text-white" : "text-ink"}`}>{name}</span>
    </Link>
  );
}
