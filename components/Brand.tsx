import Image from "next/image";
import Link from "next/link";

/**
 * Table & Bell platform mark. Files live in public/brand, so a better logo can be
 * swapped in later by replacing mascot.png (square, transparent) with no code change.
 */
export function Brand({ name, href = "/", dark = true }: { name: string; href?: string; dark?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <Image src="/brand/mascot.png" alt="" width={40} height={40} priority className="w-10 h-10 object-contain" />
      <span className={`font-extrabold tracking-tight text-lg ${dark ? "text-white" : "text-ink"}`}>{name}</span>
    </Link>
  );
}
