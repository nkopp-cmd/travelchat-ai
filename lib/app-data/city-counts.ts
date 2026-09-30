import { ENABLED_CITIES } from "@/lib/cities";
import { shouldShowPublicSpot, PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS } from "@/lib/spots/public-quality";

export interface ImportedCitySpot {
  payload: string;
  visible: number;
}

type CityStatus = "recommended" | "available" | "beta" | "hidden";

function english(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const field = (value as Record<string, unknown>).en;
  return typeof field === "string" ? field : "";
}

const excludedNames = PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS.map(pattern =>
  new RegExp(`^${pattern.split("%").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i"));

/** The same projection serves candidate requests and the offline drift gate. */
export function projectImportedCities(rows: ImportedCitySpot[]) {
  const counts = new Map(ENABLED_CITIES.map(city => [city.slug, 0]));
  for (const row of rows) {
    if (row.visible !== 1) continue;
    const spot = JSON.parse(row.payload);
    const name = english(spot.name);
    // Match the existing SQL prefilter before its quality filter.
    if (!name || excludedNames.some(pattern => pattern.test(name)) ||
        !Array.isArray(spot.photos) || spot.photos.length === 0 ||
        !shouldShowPublicSpot(spot)) continue;
    const address = english(spot.address).toLowerCase();
    for (const city of ENABLED_CITIES) {
      if (address.includes(city.name.toLowerCase())) {
        counts.set(city.slug, (counts.get(city.slug) ?? 0) + 1);
      }
    }
  }
  return ENABLED_CITIES.map(city => {
    const spotCount = counts.get(city.slug) ?? 0;
    const status: CityStatus = spotCount >= 150 ? "recommended"
      : spotCount >= 60 ? "available" : spotCount >= 1 ? "beta" : "hidden";
    return { ...city, spotCount, status };
  });
}
