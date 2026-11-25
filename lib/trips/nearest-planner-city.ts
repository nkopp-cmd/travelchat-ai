// Push DD3: a ?city= link can name a city the planner does not offer (e.g. Nara). Offer the closest city it does
// offer as a one-tap swap. Centers come from lib/cities.ts via city-centers.json (lib/trips/nearest-planner-city.test
// keeps them in sync); loaded on demand so the normal planner path ships none of it.

export type CityCenters = Record<string, { name: string; at: [number, number] }>;

/** Farther than this is not "nearby": the user gets the plain pick-a-city prompt. */
export const NEARBY_MAX_KM = 600;

function km(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function findCenter(centers: CityCenters, wanted: string) {
  const key = wanted.trim().toLowerCase();
  if (centers[key]) return centers[key];
  return Object.values(centers).find((c) => c.name.toLowerCase() === key);
}

/** The planner city (by name) closest to `wanted`, within NEARBY_MAX_KM; null when unknown or none is near. */
export function nearestPlannerCity(
  centers: CityCenters,
  wanted: string,
  planner: { slug: string; name: string }[],
): { slug: string; name: string; km: number } | null {
  const from = findCenter(centers, wanted);
  if (!from) return null;
  let best: { slug: string; name: string; km: number } | null = null;
  for (const city of planner) {
    const to = centers[city.slug];
    if (!to || to === from) continue;
    const distance = km(from.at, to.at);
    if (distance <= NEARBY_MAX_KM && (!best || distance < best.km)) best = { slug: city.slug, name: city.name, km: Math.round(distance) };
  }
  return best;
}
