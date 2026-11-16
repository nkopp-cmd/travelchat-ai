import { ENABLED_CITIES } from "@/lib/cities";
import { shouldShowPublicSpot, type PublicSpotQualityInput } from "@/lib/spots/public-quality";

/** English address as `address->>en` reads it: only an object's `en` member, never a plain string. */
function addressEn(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const en = (address as { en?: unknown }).en;
  return typeof en === "string" ? en : null;
}

type CitySpot = PublicSpotQualityInput & { city?: string | null };

/**
 * The /spots list rule (lib/spots/d1-queries.ts): the `city` column (canonical lib/cities.ts name) wins; only rows
 * without one fall back to `address->>en ILIKE '%<city>%'`. Many Hanoi/HCMC rows name only the district in the
 * address, so an address-only match counted 3 spots there while /spots listed 50+.
 */
export function spotMatchesCity(spot: { city?: string | null; address?: unknown }, cityName: string): boolean {
  if (spot.city) return spot.city === cityName;
  return addressEn(spot.address)?.toLowerCase().includes(cityName.toLowerCase()) ?? false;
}

/** Per-city counts of visible spots, matched with spotMatchesCity. */
export function countSpotsByCity(spots: CitySpot[]): Map<string, number> {
  const counts = new Map<string, number>();
  const visible = spots.filter((spot) => shouldShowPublicSpot(spot));
  for (const city of ENABLED_CITIES) {
    counts.set(city.slug, visible.filter((spot) => spotMatchesCity(spot, city.name)).length);
  }
  return counts;
}
