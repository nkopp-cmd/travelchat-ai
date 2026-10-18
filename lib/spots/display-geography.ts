import { ALL_CITIES } from "@/lib/cities";

/** Display only place names present in the address. A country is never a city fallback. */
export function addressDisplayGeography(address: string) {
  function mentions(name: string) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(String.raw`(?:^|[^\p{L}\p{N}])${escaped}(?=$|[^\p{L}\p{N}])`, "iu").test(address);
  }
  const matches = ALL_CITIES.filter(city => mentions(city.name));
  // Conflicting cities require review. Do not turn an ambiguous address into a confident label.
  if (matches.length !== 1) return {};
  const city = matches[0];
  const areas = city.neighborhoods.filter(mentions);
  return { cityName: city.name, citySlug: city.slug, areaName: areas.length === 1 ? areas[0] : undefined };
}
