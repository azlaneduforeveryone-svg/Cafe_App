"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, ImagePlus, Mail, MessageCircle } from "lucide-react";
import { createClientAction, newOwnerLinkAction, type ClientActionResult } from "@/app/admin/clients/actions";
import type { ClientRow, OwnerLink } from "@/lib/clients";
import { shrinkImage } from "@/lib/image";

const input = "w-full px-3 py-2 rounded-xl bg-white border border-line text-sm focus:outline-none focus:ring-2 focus:ring-ember";

const ERRORS: Record<string, string> = {
  missing: "Restaurant name and owner name are required.",
  country: "Pick Saudi Arabia or Pakistan.",
  bad_code: "CR and VAT numbers can only use letters, digits and dashes (30 max).",
  bad_contact: "Owner contact must be a valid email or a Saudi/Pakistani mobile.",
  account_exists: "That email or mobile already has a Table & Bell login. One login can belong to one restaurant only.",
  bad_phone: "Restaurant phone is not a valid Saudi or Pakistani number.",
  image_type: "Logo must be a PNG, JPG or WebP image.",
  owner_exists: "This restaurant already has an owner.",
  not_found: "Restaurant not found.",
  server_error: "Something went wrong. Nothing was saved.",
};

const STATUS: Record<ClientRow["status"], { label: string; cls: string }> = {
  active: { label: "Owner joined", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  link_sent: { label: "Link sent", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  link_expired: { label: "Link expired", cls: "bg-amber-50 text-amber-800 border-amber-200" },
};

const day = (ms: number | null) => (ms ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Riyadh" }).format(new Date(ms)) : "");

export function ClientAdmin({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OwnerLink | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  function show(res: ClientActionResult) {
    if (res.ok) {
      setResult(res.value);
      setError(null);
      router.refresh();
    } else setError(ERRORS[res.error] ?? ERRORS.server_error);
  }

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const small = await shrinkImage(f, 512, true);
      setLogoFile(small);
      setLogoPreview(URL.createObjectURL(small));
      setError(null);
    } catch {
      setError(ERRORS.image_type);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.delete("logoPick");
    if (logoFile) fd.set("logo", logoFile);
    setBusy(true);
    const res = await createClientAction(fd).catch(() => ({ ok: false as const, error: "server_error" }));
    setBusy(false);
    show(res);
    if (res.ok) {
      form.reset();
      setLogoFile(null);
      setLogoPreview(null);
    }
  }

  async function relink(id: string) {
    setBusy(true);
    const res = await newOwnerLinkAction(id).catch(() => ({ ok: false as const, error: "server_error" }));
    setBusy(false);
    show(res);
  }

  return (
    <div className="space-y-6">
      {result && <LinkCard result={result} onClose={() => setResult(null)} />}

      <form onSubmit={submit} className="bg-white border border-line rounded-2xl p-5 space-y-6">
        <div>
          <h2 className="text-lg font-extrabold">Create restaurant for a client</h2>
          <p className="text-stone-500">The owner gets a one-time link (valid 7 days) to set a password. Their 14-day trial starts when they join.</p>
        </div>

        <Section title="Restaurant">
          <div className="sm:col-span-2 flex items-center gap-4">
            <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-line flex items-center justify-center bg-cream cursor-pointer overflow-hidden shrink-0">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
              ) : (
                <ImagePlus className="w-6 h-6 text-stone-400" aria-hidden />
              )}
              <input name="logoPick" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={pickLogo} aria-label="Restaurant logo" />
            </label>
            <p className="text-stone-500 text-xs">Client&apos;s logo. Square works best; shown on guest screens. Resized to 512px before upload.</p>
          </div>
          <Field label="Name (English) *" name="name" required maxLength={80} />
          <Field label="Name (Arabic)" name="nameAr" maxLength={80} dir="rtl" />
          <Field label="Name (Urdu)" name="nameUr" maxLength={80} dir="rtl" />
          <label className="block space-y-1">
            <span className="font-bold">Country *</span>
            <select name="country" required defaultValue="SA" className={input}>
              <option value="SA">Saudi Arabia</option>
              <option value="PK">Pakistan</option>
            </select>
          </label>
          <Field label="City" name="city" maxLength={60} />
          <Field label="Restaurant phone (guests see it)" name="businessPhone" maxLength={40} inputMode="tel" />
          <div className="sm:col-span-2">
            <Field label="Address (guests see it)" name="address" maxLength={200} />
          </div>
        </Section>

        <Section title="Business record (private)">
          <Field label="Legal name" name="legalName" maxLength={120} />
          <Field label="CR number" name="crNumber" maxLength={30} pattern="[A-Za-z0-9-]*" />
          <Field label="VAT number" name="vatNumber" maxLength={30} pattern="[A-Za-z0-9-]*" />
        </Section>

        <Section title="Owner">
          <Field label="Owner name *" name="ownerName" required maxLength={60} />
          <Field label="Owner mobile or email *" name="ownerContact" required maxLength={120} placeholder="05xxxxxxxx or name@example.com" />
        </Section>

        {error && (
          <p role="alert" className="font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="px-5 py-3 rounded-xl bg-ember hover:bg-ember-dark text-white font-extrabold disabled:opacity-60">
          {busy ? "Working..." : "Create restaurant and owner link"}
        </button>
      </form>

      <div className="bg-white border border-line rounded-2xl p-5 space-y-3">
        <h2 className="text-lg font-extrabold">Client restaurants ({clients.length})</h2>
        {clients.length === 0 ? (
          <p className="text-stone-500">None yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-xs uppercase text-stone-500">
                <tr>
                  <th className="py-2 pr-3">Restaurant</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-t border-line align-top">
                    <td className="py-2.5 pr-3">
                      <a href={`/r/${c.slug}`} target="_blank" rel="noreferrer" className="font-bold hover:underline">
                        {c.name}
                      </a>
                      <span className="block text-xs text-stone-500">
                        {c.city ? `${c.city}, ` : ""}
                        {c.country === "SA" ? "Saudi Arabia" : "Pakistan"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {c.ownerName}
                      <span className="block text-xs text-stone-500">{c.ownerContact}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-bold ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
                      {c.status === "link_sent" && <span className="block text-xs text-stone-500">until {day(c.linkExpiresAt)}</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-stone-600">{day(c.createdAt)}</td>
                    <td className="py-2.5 text-right">
                      {c.status !== "active" && (
                        <button type="button" disabled={busy} onClick={() => relink(c.id)} className="px-3 py-1.5 rounded-lg border border-line font-bold hover:border-stone-400 disabled:opacity-60">
                          New owner link
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-extrabold uppercase tracking-wider text-stone-500 mb-2">{title}</legend>
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
    </fieldset>
  );
}

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1">
      <span className="font-bold">{label}</span>
      <input {...rest} className={input} />
    </label>
  );
}

function LinkCard({ result, onClose }: { result: OwnerLink; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const phone = result.share.startsWith("https://wa.me/");
  async function copy() {
    await navigator.clipboard.writeText(result.link).catch(() => {});
    setCopied(true);
  }
  return (
    <div role="status" className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-extrabold text-emerald-900">{result.name} is ready. Send the owner this link.</p>
          <p className="text-emerald-800 text-xs">
            For {result.contact}. It is shown only now and works once, for 7 days. Lost it? Use &quot;New owner link&quot; below.
          </p>
          {result.logoFailed && <p className="text-amber-800 text-xs font-bold mt-1">The logo did not upload. The owner can add it in Settings.</p>}
        </div>
        <button type="button" onClick={onClose} className="text-emerald-900 font-bold text-xs hover:underline">
          Close
        </button>
      </div>
      <code className="block break-all bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs">{result.link}</code>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-emerald-300 font-bold">
          {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </button>
        <a href={result.share} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white font-bold">
          {phone ? <MessageCircle className="w-4 h-4" aria-hidden /> : <Mail className="w-4 h-4" aria-hidden />}
          {phone ? "Send on WhatsApp" : "Send by email"}
        </a>
        <a href={`/r/${result.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-emerald-300 font-bold">
          <ExternalLink className="w-4 h-4" aria-hidden />
          Guest page
        </a>
      </div>
    </div>
  );
}
