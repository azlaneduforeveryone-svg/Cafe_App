import Link from "next/link";
import { Brand } from "./Brand";

export type LegalSection = { h: string; p?: string[]; list?: string[] };

/** Plain, readable layout for the Privacy Policy and Terms (English, left to right). */
export function LegalDoc({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <div lang="en" dir="ltr" className="flex-1 flex flex-col bg-cream">
      <header className="bg-ink">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/" aria-label="Table & Bell home">
            <Brand name="Table & Bell" />
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10">
        <h1 className="display text-3xl font-bold">{title}</h1>
        <p className="text-sm text-stone-500 mt-1">Last updated: {updated}</p>
        <p className="mt-6 text-[15px] leading-7 text-stone-800">{intro}</p>
        {sections.map((s, i) => (
          <section key={s.h} className="mt-8">
            <h2 className="text-lg font-extrabold">
              {i + 1}. {s.h}
            </h2>
            {s.p?.map((t) => (
              <p key={t} className="mt-3 text-[15px] leading-7 text-stone-800">
                {t}
              </p>
            ))}
            {s.list && (
              <ul className="mt-3 list-disc ps-6 space-y-1.5 text-[15px] leading-7 text-stone-800">
                {s.list.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-stone-500 space-x-3">
        <Link href="/privacy" className="hover:underline">
          Privacy Policy
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:underline">
          Terms of Service
        </Link>
        <span aria-hidden>·</span>
        <Link href="/" className="hover:underline">
          Home
        </Link>
      </footer>
    </div>
  );
}
