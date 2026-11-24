import { MapPin, Phone } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import type { Restaurant } from "@/lib/types";

/** The restaurant's own address and phone on the guest join page, when the owner gave them. */
export function RestaurantContact({ t, contact }: { t: Dict; contact: Restaurant["contact"] }) {
  const place = [contact.address, contact.city].filter(Boolean).join(", ");
  if (!place && !contact.phone) return null;
  return (
    <div className="mt-4 p-4 rounded-2xl bg-white border border-line text-sm space-y-2">
      {place && (
        <p className="flex items-start gap-2 text-stone-600">
          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-ember" aria-hidden />
          <span>{place}</span>
        </p>
      )}
      {contact.phone && (
        <a href={`tel:+${contact.phone}`} className="flex items-center gap-2 font-bold text-ink hover:underline">
          <Phone className="w-4 h-4 shrink-0 text-ember" aria-hidden />
          <span>{t.guestCallUs}</span>
          <bdi dir="ltr" className="text-stone-500 font-medium">+{contact.phone}</bdi>
        </a>
      )}
    </div>
  );
}
