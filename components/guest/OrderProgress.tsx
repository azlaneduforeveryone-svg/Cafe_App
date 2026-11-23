import { Check, ChefHat, ClipboardList, Utensils } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import { stageOf, type Order } from "@/lib/types";

const STEPS = ["ordered", "cooking", "ready", "served"] as const;

/** Circular progress ring with the order's live stage: Ordered -> Cooking -> Ready -> Served. */
export function OrderProgress({ t, order, size = 64 }: { t: Dict; order: Order; size?: number }) {
  const stage = stageOf(order);
  if (stage === "cancelled") return null;
  const idx = STEPS.indexOf(stage);
  const pct = (idx + 1) / STEPS.length;
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const d = t as unknown as Record<string, string>;
  const Icon = stage === "ordered" ? ClipboardList : stage === "cooking" ? ChefHat : stage === "ready" ? Utensils : Check;
  const color = stage === "ready" || stage === "served" ? "#15803d" : stage === "cooking" ? "#c84b31" : "#d4a359";
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={d[`stage_${stage}`]}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e7e0d5" strokeWidth="6" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            style={{ transition: "stroke-dashoffset 600ms ease, stroke 300ms" }}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center ${stage === "cooking" ? "animate-pulse" : ""}`}>
          <Icon className="w-5 h-5" style={{ color }} aria-hidden />
        </span>
      </div>
      <ol className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-bold">
        {STEPS.map((s, i) => (
          <li key={s} className={i <= idx ? "text-ink" : "text-stone-400"}>
            {d[`stage_${s}`]}
            {i < STEPS.length - 1 && <span className="text-stone-300 ms-2" aria-hidden>›</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
