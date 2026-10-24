/**
 * The Google listing a spot belongs to, as stored in D1 spot_listing_places: the stored google_place_id, or the one
 * place id its photo references name, and only when every photo reference names that same place. Shared by the D1
 * import (scripts/d1-migration/core-import.mjs) and the D1 facade's spots write hook.
 */
export function photoPlaceIds(photos: unknown): string[] {
  const ids = new Set<string>();
  for (const photo of Array.isArray(photos) ? photos : []) {
    const text = typeof photo === "string" ? photo : JSON.stringify(photo);
    for (const match of text.matchAll(/places(?:\/|%2F)([A-Za-z0-9_-]{1,256})(?:\/|%2F)photos/g)) ids.add(match[1]);
  }
  return [...ids];
}

export function listingPlaceFor(spot: { google_place_id?: string | null; photos?: unknown }): { placeId: string; source: string } | null {
  const places = photoPlaceIds(spot.photos);
  const placeId = spot.google_place_id ?? (places.length === 1 ? places[0] : null);
  if (!placeId || !/^[A-Za-z0-9_-]{1,256}$/.test(placeId) || !places.every((id) => id === placeId)) return null;
  return { placeId, source: spot.google_place_id ? "live google_place_id" : "live catalog photo reference" };
}
