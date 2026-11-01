/**
 * Helper 5 "Find somewhere open nearby" (shared/plans/localley-helper-community.md). Pure parts only, so the
 * page script, the two API routes and the tests share one definition.
 *
 * Nearby spots come from our own stored coordinates; hours come from one tap to the map apps (no Places call, so no
 * metered cost and no Places content to store).
 */

export const NEARBY_RADIUS_KM = 2;
export const NEARBY_LIMIT = 10;

/** ISO 3166 code per help country slug. */
export const HELP_COUNTRY_CODES: Record<string, string> = {
  korea: "KR", japan: "JP", thailand: "TH", vietnam: "VN", taiwan: "TW", singapore: "SG",
};

export type NearbySpot = { id: string; name: string; localName: string | null; category: string | null; distanceM: number; google: string; naver: string | null };

export type NearbyResponse = { status: "ok"; spots: NearbySpot[] } | { status: "unavailable"; spots: [] };

/** Rounds a coordinate to ~110 m: the query never needs the visitor's exact position. */
export function parseNearbyPoint(lat: string | null, lng: string | null): { lat: number; lng: number } | null {
  if (lat === null || lng === null || !/^-?\d{1,3}(\.\d{1,8})?$/.test(lat) || !/^-?\d{1,3}(\.\d{1,8})?$/.test(lng)) return null;
  const point = { lat: Math.round(Number(lat) * 1000) / 1000, lng: Math.round(Number(lng) * 1000) / 1000 };
  return Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 ? point : null;
}

/** Latitude/longitude window that contains the radius circle (SQL pre-filter before the exact distance). */
export function boundingBox(point: { lat: number; lng: number }, radiusKm = NEARBY_RADIUS_KM) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(Math.cos((point.lat * Math.PI) / 180), 0.01));
  return { minLat: point.lat - dLat, maxLat: point.lat + dLat, minLng: point.lng - dLng, maxLng: point.lng + dLng };
}

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/**
 * Free hours evidence: the listing in Google Maps (by place ID when we have one) and, in Korea, Naver Map, where
 * local hours are kept most current. No billed Places call and nothing stored.
 */
export function mapLinks(spot: { name: string; localName: string | null; lat: number; lng: number; googlePlaceId: string | null }, countryCode: string) {
  const query = spot.localName || spot.name;
  const placeId = spot.googlePlaceId && /^[A-Za-z0-9_-]{1,256}$/.test(spot.googlePlaceId) ? spot.googlePlaceId : null;
  const google = new URL("https://www.google.com/maps/search/");
  google.searchParams.set("api", "1");
  google.searchParams.set("query", placeId ? query : `${query} ${spot.lat},${spot.lng}`);
  if (placeId) google.searchParams.set("query_place_id", placeId);
  const naver = countryCode === "KR" ? `https://map.naver.com/p/search/${encodeURIComponent(query)}?c=${spot.lng},${spot.lat},16,0,0,0,dh` : null;
  return { google: google.toString(), naver };
}
