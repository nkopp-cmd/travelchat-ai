import { ENABLED_CITIES } from "@/lib/cities";
import { shouldShowPublicSpot, type PublicSpotQualityInput } from "@/lib/spots/public-quality";

/** English address as `address->>en` reads it: only an object's `en` member, never a plain string. */
function addressEn(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const en = (address as { en?: unknown }).en;
  return typeof en === "string" ? en : null;
}

/** Per-city counts of visible spots; the city match is `address->>en ILIKE '%<city>%'`. */
export function countSpotsByCity(spots: PublicSpotQualityInput[]): Map<string, number> {
  const counts = new Map<string, number>();
  const addresses = spots.filter((spot) => shouldShowPublicSpot(spot))
    .map((spot) => addressEn(spot.address)?.toLowerCase()).filter((value): value is string => Boolean(value));
  for (const city of ENABLED_CITIES) {
    const term = city.name.toLowerCase();
    counts.set(city.slug, addresses.filter((address) => address.includes(term)).length);
  }
  return counts;
}
