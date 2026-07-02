export interface SpotProximityInput {
  lat: number;
  lng: number;
  category?: string | null;
  localleyScore?: number | null;
  localPercentage?: number | null;
}

const EARTH_RADIUS_KM = 6371;

export function hasUsableSpotCoordinate(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function getSpotDistanceKm(
  from: SpotProximityInput,
  to: SpotProximityInput,
): number | null {
  if (
    !hasUsableSpotCoordinate(from.lat, from.lng) ||
    !hasUsableSpotCoordinate(to.lat, to.lng)
  ) {
    return null;
  }

  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

export function getRelatedSpotSortScore(
  current: SpotProximityInput,
  candidate: SpotProximityInput,
): number {
  const distanceKm = getSpotDistanceKm(current, candidate);
  const distanceScore = distanceKm === null ? 10000 : distanceKm * 10;
  const sameCategoryBoost =
    current.category &&
    candidate.category &&
    current.category.toLowerCase() === candidate.category.toLowerCase()
      ? 8
      : 0;
  const localleyBoost = (candidate.localleyScore || 0) * 0.7;
  const localCrowdBoost = (candidate.localPercentage || 0) * 0.015;

  return distanceScore - sameCategoryBoost - localleyBoost - localCrowdBoost;
}

export function compareRelatedSpotCandidates(
  current: SpotProximityInput,
  a: SpotProximityInput,
  b: SpotProximityInput,
): number {
  const scoreDelta =
    getRelatedSpotSortScore(current, a) - getRelatedSpotSortScore(current, b);
  if (scoreDelta !== 0) return scoreDelta;

  return (b.localleyScore || 0) - (a.localleyScore || 0);
}

export function formatRelatedSpotDistance(distanceKm: number | null): string {
  if (distanceKm === null) return "Same-city pick";
  if (distanceKm < 1) return `${Math.max(50, Math.round(distanceKm * 1000))} m away`;
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km away`;
  return `${Math.round(distanceKm)} km in the city`;
}
