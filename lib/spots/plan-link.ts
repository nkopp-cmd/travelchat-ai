import { ENABLED_CITIES } from "@/lib/cities";
import { distanceKm } from "@/lib/geocoding";

/** Day trips (Amphawa, Suwon, Yokohama) still get a city plan when a planner city is this close. */
export const NEAR_PLANNER_CITY_KM = 150;

export interface SpotPlanLink {
  href: string;
  /** Button text for the hero and nearby CTAs. */
  label: string;
  /** Button text for the sidebar CTA. */
  shortLabel: string;
}

/**
 * Names of the cities the planner offers (lib/cities-catalog plannerCities), or null when that list is not known.
 * Push DD2: an enabled city below PLANNER_MIN_SPOTS (Nara, Jeju) cannot build a free plan, so no link opens it.
 */
export type OfferedPlannerCities = ReadonlySet<string> | null | undefined;

/** The nearest enabled planner city within NEAR_PLANNER_CITY_KM of the spot, else null. */
export function nearestPlannerCity(lat: number | null | undefined, lng: number | null | undefined, offered?: OfferedPlannerCities): string | null {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: { name: string; km: number } | null = null;
  for (const city of ENABLED_CITIES) {
    if (offered && !offered.has(city.name)) continue;
    const km = distanceKm(lat, lng, city.center.lat, city.center.lng);
    if (km <= NEAR_PLANNER_CITY_KM && (!best || km < best.km)) best = { name: city.name, km };
  }
  return best?.name ?? null;
}

/**
 * Push CK1: the planner keeps a pinned spot only inside its city, and a link with ?spot= and no city opens the bare
 * city grid and drops the spot. So only a spot with a planner city promises "a day around <spot>"; a day-trip spot
 * links to the nearest planner city's plan, and a spot far from every planner city links to the plain planner.
 */
export function spotPlanLink(spot: { id: string; name: string; plannerCity: string | null; lat?: number | null; lng?: number | null }, offered?: OfferedPlannerCities): SpotPlanLink {
  if (spot.plannerCity && (!offered || offered.has(spot.plannerCity))) {
    return {
      href: `/itineraries/new?${new URLSearchParams({ spot: spot.id, city: spot.plannerCity })}`,
      label: `Plan a free day around ${spot.name}`,
      shortLabel: "Plan a free trip with this spot",
    };
  }
  const near = nearestPlannerCity(spot.lat, spot.lng, offered);
  if (near) {
    const label = `Plan a free ${near} trip`;
    return { href: `/itineraries/new?${new URLSearchParams({ city: near })}`, label, shortLabel: label };
  }
  return { href: "/itineraries/new", label: "Plan a free trip", shortLabel: "Plan a free trip" };
}
