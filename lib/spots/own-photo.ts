/** R2 object (COMMUNITY_MEDIA bucket) of a spot's own photo: content-addressed, so the public URL is immutable. */
export const SPOT_PHOTO_KEY = /^spot-photos\/([0-9a-f-]{36})\/([0-9a-f]{64})\.webp$/;

/** Public path of a stored spot photo. */
export function spotPhotoPath(key: string): string {
  const match = SPOT_PHOTO_KEY.exec(key);
  if (!match) throw new Error("not a spot photo key");
  return `/media/spot/${match[1]}/${match[2]}.webp`;
}

/** Public path for a spot_photos.r2_key read from D1, or null when there is none (or it is not a spot photo key). */
export function ownSpotPhotoPath(key: unknown): string | null {
  return typeof key === "string" && SPOT_PHOTO_KEY.test(key) ? spotPhotoPath(key) : null;
}

/**
 * Photos a card or hero shows without a Places call. Our own R2 photo comes first; a Google listing without one
 * gets [] so the client asks Places (the fallback, never stored); other spots keep their direct source photos.
 */
export function directSpotPhotos(spot: { ownPhoto?: string | null; googlePlaceId?: string | null; photos?: string[] | null }): string[] {
  const direct = spot.googlePlaceId ? [] : (spot.photos ?? []).filter((photo) => !photo.includes("/api/places/photo"));
  return spot.ownPhoto ? [spot.ownPhoto, ...direct.filter((photo) => photo !== spot.ownPhoto)] : direct;
}

/**
 * Width of the one Google photo a card, Nearby row or map pin shows. Google bills per photo request, not per pixel,
 * so every small surface asks for the SAME URL: the browser cache (private, 1 day) then serves card + pin + Nearby
 * with one billed call per spot and visitor a day. 400 keeps a 390 px phone card sharp enough.
 */
export const CARD_PHOTO_WIDTH = 400;
const PLACE_PHOTO_NAME = /^places\/[A-Za-z0-9_-]{1,256}\/photos\/[A-Za-z0-9_-]{1,4096}$/;

/** The stored Google photo name (D1 spots.photos = /api/places/photo?name=...) of a spot, or null. */
export function storedGooglePhotoName(photos: readonly string[] | null | undefined): string | null {
  for (const photo of photos ?? []) {
    if (!photo.includes("/api/places/photo")) continue;
    try {
      const name = new URL(photo, "https://www.localley.io").searchParams.get("name");
      if (name && PLACE_PHOTO_NAME.test(name)) return name;
    } catch { /* not a URL */ }
  }
  return null;
}

/** The canonical small proxy URL for a stored Google photo name (one URL per spot, shared by every small surface). */
export function cardGooglePhotoUrl(name: string): string {
  return `/api/places/photo?name=${encodeURIComponent(name)}&w=${CARD_PHOTO_WIDTH}`;
}

/**
 * Photos a card, Nearby row or pin shows, server-rendered and without a Details call: our own photo, the direct
 * source photos, then the spot's first stored Google photo (one Photo call, lazy, browser-cached for a day).
 */
export function cardSpotPhotos(spot: { ownPhoto?: string | null; googlePlaceId?: string | null; photos?: string[] | null }): string[] {
  const name = storedGooglePhotoName(spot.photos);
  return [...directSpotPhotos(spot), ...(name ? [cardGooglePhotoUrl(name)] : [])];
}

/** True for the canonical small Google proxy URL built by cardGooglePhotoUrl. */
export function isCardGooglePhotoUrl(src: string): boolean {
  const name = storedGooglePhotoName([src]);
  return name !== null && src === cardGooglePhotoUrl(name);
}
