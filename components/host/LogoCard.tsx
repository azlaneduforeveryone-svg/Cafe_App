"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2, Utensils } from "lucide-react";
import { uploadImage } from "@/lib/image";
import type { Dict } from "@/lib/i18n";

export function uploadErrorText(t: Dict, code: string) {
  if (code === "image_type") return t.imageType;
  if (code === "image_too_big") return t.imageTooBig;
  if (code === "demo_locked") return t.demoLocked;
  return t.errorGeneric;
}

export function LogoCard({ t, initialUrl }: { t: Dict; initialUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const up = await uploadImage(file, "logo");
      setUrl(up.url);
      router.refresh();
    } catch (e) {
      setError(uploadErrorText(t, (e as Error).message));
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/host/logo", { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      setUrl(null);
      router.refresh();
    } else setError(t.errorGeneric);
    setBusy(false);
  }

  return (
    <div className="bg-white rounded-3xl border border-line shadow-sm p-5 flex items-center gap-4">
      <div className="w-20 h-20 rounded-2xl border border-line bg-cream flex items-center justify-center overflow-hidden shrink-0">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="w-full h-full object-contain" />
        ) : (
          <Utensils className="w-8 h-8 text-stone-400" aria-hidden />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="font-extrabold text-sm">{t.logoTitle}</h2>
        <p className="text-xs text-stone-500 mt-0.5">{t.logoHelp}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="px-3 py-2 rounded-xl bg-ink hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <ImagePlus className="w-4 h-4" aria-hidden />
            {busy ? t.uploading : url ? t.changeLogo : t.uploadLogo}
          </button>
          {url && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="px-3 py-2 rounded-xl text-xs font-bold text-stone-600 hover:text-red-700 hover:bg-red-50 inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" aria-hidden />
              {t.removeLogo}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs font-semibold text-red-700 mt-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
